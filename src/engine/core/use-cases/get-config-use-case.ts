import {combineConfigAndProjectRoles} from '../role-utils';
import {Config} from '../stores/config-store';
import type {ConfigVariant} from '../stores/config-variant-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigRequest {
  name: string;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface PendingConfigProposalSummary {
  id: string;
  proposerId: number | null;
  proposerEmail: string | null;
  createdAt: Date;
  baseConfigVersion: number;
}

export interface ConfigVariantWithEnvironmentName extends ConfigVariant {
  environmentName: string | null; // null for default variant
}

export interface ConfigDetails {
  config: Config;
  variants: ConfigVariantWithEnvironmentName[];
  editorEmails: string[];
  maintainerEmails: string[];
  myRole: 'maintainer' | 'editor' | 'viewer';
  pendingConfigProposals: PendingConfigProposalSummary[];
}

export interface GetConfigResponse {
  config: ConfigDetails | undefined;
}

export interface GetConfigUseCasesDeps {}

export function createGetConfigUseCase({}: GetConfigUseCasesDeps): TransactionalUseCase<
  GetConfigRequest,
  GetConfigResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

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

    // Get all variants for this config (including default variant with environmentId=null)
    const allVariants = await tx.configVariants.getByConfigId(config.id);
    
    // Include all variants - the UI will handle separating default from environment-specific
    const variants: ConfigVariantWithEnvironmentName[] = allVariants;

    // Get pending config-level proposals (deletion, members, description)
    const pendingConfigProposals = await tx.configProposals.getPendingProposalsWithProposerEmails({
      configId: config.id,
    });

    return {
      config: {
        config: {
          id: config.id,
          name: config.name,
          projectId: config.projectId,
          description: config.description,
          creatorId: config.creatorId,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          version: config.version,
        } satisfies Config,
        variants,
        editorEmails: configUsers
          .filter(cu => cu.role === 'editor')
          .map(cu => cu.user_email_normalized)
          .sort(),
        maintainerEmails: configUsers
          .filter(cu => cu.role === 'maintainer')
          .map(cu => cu.user_email_normalized)
          .sort(),
        myRole: myProjectRole
          ? combineConfigAndProjectRoles(myProjectRole.role, myConfigRole)
          : myConfigRole,
        pendingConfigProposals,
      },
    };
  };
}
