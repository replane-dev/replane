import assert from 'assert';
import {ForbiddenError, NotFoundError} from '../errors';
import {processLogoImage} from '../image-utils';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface UpdateWorkspaceRequest {
  workspaceId: string;
  currentUserEmail: NormalizedEmail;
  name: string;
  /** Base64 data URL for new logo, null to remove, undefined to keep unchanged */
  logo?: string | null;
}

export interface UpdateWorkspaceResponse {
  success: boolean;
}

export function createUpdateWorkspaceUseCase(): TransactionalUseCase<
  UpdateWorkspaceRequest,
  UpdateWorkspaceResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceAdmin(ctx, {
      workspaceId: req.workspaceId,
      currentUserEmail: req.currentUserEmail,
    });

    const now = new Date();

    const workspace = await tx.workspaces.getById({
      id: req.workspaceId,
      currentUserEmail: req.currentUserEmail,
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Only admins can update workspace settings
    if (workspace.myRole !== 'admin') {
      throw new ForbiddenError('Only workspace admins can update settings');
    }

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    // Process logo if provided (resize and convert to PNG)
    let processedLogo: string | null | undefined = undefined;
    if (req.logo !== undefined) {
      processedLogo = req.logo === null ? null : await processLogoImage(req.logo);
    }

    await tx.workspaces.updateById({
      id: req.workspaceId,
      name: req.name,
      logo: processedLogo,
      updatedAt: now,
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'workspace_updated',
        workspace: {
          id: req.workspaceId,
          name: req.name,
        },
        before: {
          name: workspace.name,
          hasLogo: workspace.logo !== null,
        },
        after: {
          name: req.name,
          hasLogo: processedLogo !== undefined ? processedLogo !== null : workspace.logo !== null,
        },
      },
    });

    return {success: true};
  };
}
