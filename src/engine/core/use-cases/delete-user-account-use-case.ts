import assert from 'assert';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteUserAccountRequest {
  currentUserEmail: NormalizedEmail;
  confirmEmail: string;
}

export interface DeleteUserAccountResponse {
  success: boolean;
}

export function createDeleteUserAccountUseCase(): TransactionalUseCase<
  DeleteUserAccountRequest,
  DeleteUserAccountResponse
> {
  return async (ctx, tx, req) => {
    const now = new Date();

    // Verify the confirmation email matches
    if (req.confirmEmail.toLowerCase() !== req.currentUserEmail.toLowerCase()) {
      throw new Error('Email confirmation does not match');
    }

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    // Remove user from all workspaces and their projects
    await tx.workspaceMemberService.removeUserFromAllWorkspaces({
      userEmail: req.currentUserEmail,
    });

    // Create audit log before deletion
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'user_account_deleted',
        user: {
          id: user.id,
          email: req.currentUserEmail,
        },
      },
    });

    // Delete user account
    // Note: Database cascading deletes will handle related records
    // (accounts, sessions, etc.)
    await tx.users.deleteById(user.id);

    return {success: true};
  };
}
