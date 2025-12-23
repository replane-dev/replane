import {getEmailFromIdentity2, isUserIdentity, type Identity} from './identity';
import {getHighestRole} from './role-utils';
import type {ConfigProposalStore} from './stores/config-proposal-store';
import type {Config, ConfigStore} from './stores/config-store';
import type {ConfigUserStore} from './stores/config-user-store';
import type {ConfigVariant, ConfigVariantStore} from './stores/config-variant-store';
import type {ProjectUserStore} from './stores/project-user-store';

export interface PendingConfigProposalSummary {
  id: string;
  authorId: number | null;
  authorEmail: string | null;
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
    identity: Identity;
  }): Promise<ConfigDetails | undefined> {
    const myProjectRole = isUserIdentity(opts.identity)
      ? await this.projectUsers.getByProjectIdAndEmail({
          projectId: opts.projectId,
          userEmail: opts.identity.user.email,
        })
      : null;

    const config = await this.configs.getByName({
      name: opts.name,
      projectId: opts.projectId,
    });
    if (!config) {
      return undefined;
    }

    const configUsers = await this.configUsers.getByConfigId(config.id);

    const myConfigRole =
      configUsers.find(cu => cu.user_email_normalized === getEmailFromIdentity2(opts.identity))
        ?.role ?? 'viewer';
    // Get all environment-specific variants for this config
    // (default variant is now part of the config itself)
    const variants = await this.configVariants.getByConfigId(config.id);

    // Get pending config-level proposals (deletion, members, description)
    const pendingConfigProposals = await this.configProposals.getPendingProposalsWithAuthorEmails({
      configId: config.id,
    });

    const myRole = getHighestRole([myProjectRole?.role ?? 'viewer', myConfigRole]);

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
      myRole: myRole === 'admin' ? 'maintainer' : myRole,
      pendingConfigProposals,
    };
  }
}
