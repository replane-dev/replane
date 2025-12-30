import {BadRequestError} from '../errors';
import type {Identity} from '../identity';
import type {AuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';

export interface GetAuditLogMessageRequest {
  id: AuditLogId;
  identity: Identity;
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

export function createGetAuditLogMessageUseCase(): TransactionalUseCase<
  GetAuditLogMessageRequest,
  GetAuditLogMessageResponse
> {
  return async (ctx, tx, req) => {
    // NOTE: We need projectId to look up the audit log. Adding projectId requirement to the request
    // would be a breaking API change. For now, we use getByIdUnsafe to find the audit log's projectId,
    // then verify permissions before returning data.
    const base = await tx.auditLogs.getByIdUnsafe(req.id);
    if (!base) return {message: undefined};

    if (base.projectId) {
      await tx.permissionService.ensureIsWorkspaceMember(ctx, {
        projectId: base.projectId,
        identity: req.identity,
      });
    } else {
      throw new BadRequestError('Audit log does not belong to a project');
    }

    const user = base.userId ? await tx.users.getById(base.userId) : undefined;
    const config = base.configId && base.projectId
      ? await tx.configs.getById({id: base.configId, projectId: base.projectId})
      : undefined;

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
