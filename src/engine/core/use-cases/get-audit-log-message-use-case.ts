import type {AuditMessageId} from '../audit-message-store';
import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetAuditLogMessageRequest {
  id: AuditMessageId;
  currentUserEmail: NormalizedEmail;
}

export interface GetAuditLogMessageResponse {
  message:
    | {
        id: string;
        createdAt: Date;
        userEmail: string | null;
        configName: string | null;
        payload: unknown;
      }
    | undefined;
}

export function createGetAuditLogMessageUseCase(): UseCase<
  GetAuditLogMessageRequest,
  GetAuditLogMessageResponse
> {
  return async (_ctx, tx, req) => {
    const base = await tx.auditMessages.getById(req.id);
    if (!base) return {message: undefined};

    const user = base.userId ? await tx.users.getById(base.userId) : undefined;
    const config = base.configId ? await tx.configs.getById(base.configId) : undefined;

    return {
      message: {
        id: base.id,
        createdAt: base.createdAt,
        userEmail: user?.email ?? null,
        configName: config?.name ?? null,
        payload: base.payload,
      },
    };
  };
}
