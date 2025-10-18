import {Config} from '../config-store';
import {combineConfigAndProjectRoles} from '../role-utils';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigRequest {
  name: string;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface PendingProposalSummary {
  id: string;
  proposerId: number | null;
  proposerEmail: string | null;
  createdAt: Date;
  baseConfigVersion: number;
}

export interface ConfigDetails {
  config: Config;
  editorEmails: string[];
  ownerEmails: string[];
  myRole: 'owner' | 'editor' | 'viewer';
  pendingProposals: PendingProposalSummary[];
}

export interface GetConfigResponse {
  config: ConfigDetails | undefined;
}

export interface GetConfigUseCasesDeps {}

export function createGetConfigUseCase(
  deps: GetConfigUseCasesDeps,
): TransactionalUseCase<GetConfigRequest, GetConfigResponse> {
  return async (ctx, tx, req) => {
    const myProjectRole = await tx.projectUsers.getByProjectIdAndEmail({
      projectId: req.projectId,
      userEmail: req.currentUserEmail,
    });

    const config = await tx.configs.getByName({
      name: req.name,
      projectId: req.projectId,
    });
    if (!config) {
      return {config: undefined};
    }

    const configUsers = await tx.configUsers.getByConfigId(config.id);

    const myConfigRole =
      configUsers.find(cu => cu.user_email_normalized === req.currentUserEmail)?.role ?? 'viewer';

    // Get pending proposals with proposer emails
    const pendingProposals = await tx.configProposals.getPendingProposalsWithProposerEmails({
      configId: config.id,
    });

    return {
      config: {
        config: {
          id: config.id,
          name: config.name,
          value: config.value,
          projectId: config.projectId,
          description: config.description,
          schema: config.schema,
          creatorId: config.creatorId,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          version: config.version,
        } satisfies Config,
        editorEmails: configUsers
          .filter(cu => cu.role === 'editor')
          .map(cu => cu.user_email_normalized)
          .sort(),
        ownerEmails: configUsers
          .filter(cu => cu.role === 'owner')
          .map(cu => cu.user_email_normalized)
          .sort(),
        myRole: myProjectRole
          ? combineConfigAndProjectRoles(myProjectRole.role, myConfigRole)
          : myConfigRole,
        pendingProposals,
      },
    };
  };
}
