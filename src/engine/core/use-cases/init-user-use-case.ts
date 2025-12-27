import {requireUserEmail, type Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';
import {normalizeEmail} from '../utils';
import {createWorkspace} from './create-workspace-use-case';

export interface InitUserRequest {
  identity: Identity;
  exampleProject?: boolean;
}

export interface InitUserResponse {
  workspaceId?: string;
  projectId?: string;
}

export function createInitUserUseCase(): TransactionalUseCase<InitUserRequest, InitUserResponse> {
  return async (ctx, tx, req) => {
    const currentUserEmail = requireUserEmail(req.identity);
    const normalizedEmail = normalizeEmail(currentUserEmail);
    const now = tx.dateProvider.now();

    // Auto-add new users to workspaces that have auto_add_new_users enabled
    const autoAddWorkspaces = await tx.db
      .selectFrom('workspaces')
      .selectAll()
      .where('auto_add_new_users', '=', true)
      .execute();

    for (const workspace of autoAddWorkspaces) {
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

    // Check if user is already part of any workspace
    const existingMemberships = await tx.workspaceMembers.getByUserEmail(normalizedEmail);

    if (existingMemberships.length > 0) {
      // User is already part of a workspace, no need to create a personal one
      return {
        workspaceId: existingMemberships[0].workspace_id,
        projectId: undefined,
      };
    }

    // Create a personal workspace with an optional example project
    const result = await createWorkspace({
      ctx,
      identity: req.identity,
      name: {type: 'personal'},
      workspaceStore: tx.workspaces,
      workspaceMemberStore: tx.workspaceMembers,
      projectStore: tx.projects,
      projectEnvironmentStore: tx.projectEnvironments,
      auditLogs: tx.auditLogs,
      now,
      configs: tx.configs,
      configService: tx.configService,
      exampleProject: req.exampleProject ?? true,
    });

    return {
      workspaceId: result.workspace.id,
      projectId: result.project.id,
    };
  };
}
