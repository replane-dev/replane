import {requireUserEmail, type Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';
import {normalizeEmail} from '../utils';
import {createWorkspace} from './create-workspace-use-case';

export interface InitUserRequest {
  identity: Identity;
  exampleProject?: boolean;
}

export interface InitUserResponse {
  workspaceId: string;
  projectId?: string;
}

export function createInitUserUseCase(): TransactionalUseCase<InitUserRequest, InitUserResponse> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    // Create a personal workspace with an optional example project
    const result = await createWorkspace({
      ctx,
      identity: req.identity,
      name: {type: 'personal'},
      workspaceStore: tx.workspaces,
      workspaceMemberStore: tx.workspaceMembers,
      projectStore: tx.projects,
      projectUserStore: tx.projectUsers,
      projectEnvironmentStore: tx.projectEnvironments,
      users: tx.users,
      auditLogs: tx.auditLogs,
      now: tx.dateProvider.now(),
      configs: tx.configs,
      configService: tx.configService,
      exampleProject: req.exampleProject ?? true,
    });

    // Auto-add new users to workspaces that have auto_add_new_users enabled
    const workspaces = await tx.db
      .selectFrom('workspaces')
      .selectAll()
      .where('auto_add_new_users', '=', true)
      .execute();

    const now = tx.dateProvider.now();
    const normalizedEmail = normalizeEmail(currentUserEmail);

    for (const workspace of workspaces) {
      // Check if already a member
      const existingMember = await tx.workspaceMembers.getByWorkspaceIdAndEmail({
        workspaceId: workspace.id,
        userEmail: normalizedEmail,
      });

      if (!existingMember) {
        await tx.workspaceMembers.create([
          {
            workspaceId: workspace.id,
            email: currentUserEmail,
            role: 'member',
            createdAt: now,
            updatedAt: now,
          },
        ]);
      }
    }

    return {
      workspaceId: result.workspace.id,
      projectId: result.project.id,
    };
  };
}
