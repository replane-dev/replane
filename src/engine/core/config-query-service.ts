import {combineConfigAndProjectRoles} from './role-utils';
import type {ConfigProposalStore} from './stores/config-proposal-store';
import type {Config, ConfigStore} from './stores/config-store';
import type {ConfigUserStore} from './stores/config-user-store';
import type {ConfigVariant, ConfigVariantStore} from './stores/config-variant-store';
import type {ProjectUserStore} from './stores/project-user-store';
import type {NormalizedEmail} from './zod';

export interface PendingConfigProposalSummary {
  id: string;
  proposerId: number | null;
  proposerEmail: string | null;
  createdAt: Date;
  baseConfigVersion: number;
}

export interface ConfigVariantWithEnvironmentName extends ConfigVariant {
  environmentName: string;
}

export interface ConfigDetails {
  config: Config;
  variants: ConfigVariantWithEnvironmentName[];
  editorEmails: string[];
  maintainerEmails: string[];
  myRole: 'maintainer' | 'editor' | 'viewer';
  pendingConfigProposals: PendingConfigProposalSummary[];
}

export class ConfigQueryService {
  constructor(
    private configs: ConfigStore,
    private configUsers: ConfigUserStore,
    private configVariants: ConfigVariantStore,
    private configProposals: ConfigProposalStore,
    private projectUsers: ProjectUserStore,
  ) {}

  async getConfigDetails(opts: {
    name: string;
    projectId: string;
    currentUserEmail: NormalizedEmail;
  }): Promise<ConfigDetails | undefined> {
    const myProjectRole = await this.projectUsers.getByProjectIdAndEmail({
      projectId: opts.projectId,
      userEmail: opts.currentUserEmail,
    });

    const config = await this.configs.getByName({
      name: opts.name,
      projectId: opts.projectId,
    });
    if (!config) {
      return undefined;
    }

    const configUsers = await this.configUsers.getByConfigId(config.id);

    const myConfigRole =
      configUsers.find(cu => cu.user_email_normalized === opts.currentUserEmail)?.role ?? 'viewer';

    // Get all environment-specific variants for this config
    // (default variant is now part of the config itself)
    const variants = await this.configVariants.getByConfigId(config.id);

    // Get pending config-level proposals (deletion, members, description)
    const pendingConfigProposals = await this.configProposals.getPendingProposalsWithProposerEmails(
      {
        configId: config.id,
      },
    );

    return {
      config,
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
    };
  }
}
