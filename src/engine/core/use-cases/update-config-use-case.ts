import type {Context} from '../context';
import {BadRequestError, NotFoundError} from '../errors';
import {getUserIdFromIdentity, isApiKeyIdentity, type Identity} from '../identity';
import type {Override} from '../override-condition-schemas';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigSchema, ConfigValue} from '../zod';

/**
 * Request for updating a config.
 * Config is identified by `projectId` + `configName`.
 */
export interface UpdateConfigRequest {
  projectId: string;
  configName: string;
  description: string;
  editors: string[];
  maintainers: string[] | null;
  base: {value: ConfigValue; schema: ConfigSchema | null; overrides: Override[]};
  environments: Array<{
    environmentId: string;
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
    useBaseSchema: boolean;
  }>;
  identity: Identity;
  /** Previous version for optimistic locking. If not provided, uses current config version. */
  prevVersion?: number;
  originalProposalId?: string;
}

export interface UpdateConfigResponse {
  configId: string;
  version: number;
}

export function createUpdateConfigUseCase(): TransactionalUseCase<
  UpdateConfigRequest,
  UpdateConfigResponse
> {
  return async (ctx: Context, tx, req) => {
    // Resolve config by projectId + configName
    const config = await tx.configs.getByName({
      projectId: req.projectId,
      name: req.configName,
    });
    if (!config) {
      throw new NotFoundError('Config not found');
    }

    const configId = config.id;

    // Get the project to check requireProposals setting
    const project = await tx.projects.getByIdWithoutPermissionCheck(config.projectId);
    if (!project) {
      throw new BadRequestError('Project not found');
    }

    // Use provided prevVersion or current config version
    const prevVersion = req.prevVersion ?? config.version;

    // Check version for optimistic locking if prevVersion was explicitly provided
    if (req.prevVersion !== undefined && config.version !== req.prevVersion) {
      throw new BadRequestError('Config was edited by another user. Please refresh and try again.');
    }

    const currentVariants = await tx.configVariants.getByConfigId(configId);
    const currentMembers = await tx.configUsers.getByConfigId(configId);
    const currentEditorEmails = currentMembers
      .filter(m => m.role === 'editor')
      .map(m => m.user_email_normalized);
    const currentMaintainerEmails = currentMembers
      .filter(m => m.role === 'maintainer')
      .map(m => m.user_email_normalized);

    // Check if approval is required using the new per-environment logic
    if (project.requireProposals && !isApiKeyIdentity(req.identity)) {
      const approvalResult = await tx.configService.isApprovalRequired({
        project,
        existingConfig: config,
        currentVariants: currentVariants.map(v => ({
          id: v.id,
          environmentId: v.environmentId,
          value: v.value,
          schema: v.schema,
          overrides: v.overrides,
        })),
        proposedDefaultVariant: req.base,
        proposedEnvironmentVariants: req.environments,
        currentMembers: {
          editorEmails: currentEditorEmails,
          maintainerEmails: currentMaintainerEmails,
        },
        proposedMembers: {
          editorEmails: req.editors,
          maintainerEmails: req.maintainers ?? currentMaintainerEmails,
        },
      });

      if (approvalResult.required) {
        throw new BadRequestError(
          `Direct config changes are disabled. ${approvalResult.reason}. Please create a proposal instead.`,
          {
            code: 'APPROVAL_REQUIRED',
          },
        );
      }
    }

    // Call configService.updateConfigDirect with full state
    await tx.configService.updateConfig(ctx, {
      configId,
      description: req.description,
      editorEmails: req.editors,
      maintainerEmails: req.maintainers ?? currentMaintainerEmails,
      defaultVariant: req.base,
      environmentVariants: req.environments,
      reviewer: req.identity,
      editAuthorId: getUserIdFromIdentity(req.identity),
      prevVersion,
      originalProposalId: req.originalProposalId,
    });

    return {
      configId,
      version: prevVersion + 1,
    };
  };
}
