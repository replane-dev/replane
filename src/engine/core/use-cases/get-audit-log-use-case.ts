import type {AuditMessage} from '../audit-message-store';
import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetAuditLogRequest {
  currentUserEmail: NormalizedEmail;
  from?: Date; // inclusive
  to?: Date; // exclusive
  authorEmails?: string[]; // normalized emails expected
  configNames?: string[];
  limit: number; // page size
  cursor?: {createdAt: Date; id: string};
}

export interface GetAuditLogResponse {
  messages: Array<{
    id: string;
    createdAt: Date;
    userEmail: string | null;
    configName: string | null;
    payload: AuditMessage['payload'];
  }>;
  nextCursor: {createdAt: Date; id: string} | null;
}

export function createGetAuditLogUseCase(): UseCase<GetAuditLogRequest, GetAuditLogResponse> {
  return async (_ctx, tx, req) => {
    let userIds: number[] | undefined = undefined;
    if (req.authorEmails && req.authorEmails.length > 0) {
      const unique = Array.from(new Set(req.authorEmails));
      const rows = await Promise.all(unique.map(e => tx.users.getByEmail(e)));
      userIds = rows.filter(Boolean).map(u => u!.id);
      if (userIds.length === 0) {
        return {messages: [], nextCursor: null};
      }
    }

    let configIds: string[] | undefined = undefined;
    if (req.configNames && req.configNames.length > 0) {
      const configs = await Promise.all(req.configNames.map(n => tx.configs.getByName(n)));
      configIds = configs.filter(Boolean).map(c => c!.id);
      if (configIds.length === 0) {
        return {messages: [], nextCursor: null};
      }
    }

    const messages = await tx.auditMessages.list({
      gte: req.from,
      lt: req.to,
      lte: req.to ?? new Date(),
      limit: req.limit + 1,
      orderBy: 'created_at desc, id desc',
      startWith: req.cursor,
      userIds,
      configIds,
    });

    const slice = messages.slice(0, req.limit);
    const next = messages.length > req.limit ? messages[req.limit] : null;

    const userIdSet = new Set<number>();
    const configIdSet = new Set<string>();
    for (const m of slice) {
      if (m.userId) userIdSet.add(m.userId);
      if (m.configId) configIdSet.add(m.configId);
    }

    const userEmailsMap = new Map<number, string | null>();
    if (userIdSet.size > 0) {
      await Promise.all(
        Array.from(userIdSet).map(async id => {
          const u = await tx.users.getById(id);
          userEmailsMap.set(id, u?.email ?? null);
        }),
      );
    }

    const configNamesMap = new Map<string, string | null>();
    if (configIdSet.size > 0) {
      await Promise.all(
        Array.from(configIdSet).map(async id => {
          const c = await tx.configs.getById(id);
          configNamesMap.set(id, c?.name ?? null);
        }),
      );
    }

    return {
      messages: slice.map(m => ({
        id: m.id,
        createdAt: m.createdAt,
        userEmail: m.userId ? userEmailsMap.get(m.userId)! : null,
        configName: m.configId ? configNamesMap.get(m.configId)! : null,
        payload: m.payload,
      })),
      nextCursor: next ? {createdAt: next.createdAt, id: next.id} : null,
    };
  };
}
