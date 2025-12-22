import assert from 'assert';
import type {Context} from '../context';
import {BadRequestError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import type {Override} from '../override-condition-schemas';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigSchema, ConfigValue} from '../zod';

export interface UpdateConfigRequest {
  configId: string;
  description: string;
  editorEmails: string[];
  maintainerEmails: string[];
  defaultVariant: {value: ConfigValue; schema: ConfigSchema | null; overrides: Override[]};
  environmentVariants: Array<{
    environmentId: string;
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
    useDefaultSchema: boolean;
  }>;
  identity: Identity;
  prevVersion: number;
  originalProposalId?: string;
}

export interface UpdateConfigResponse {}

export function createUpdateConfigUseCase(): TransactionalUseCase<
  UpdateConfigRequest,
  UpdateConfigResponse
> {
  return async (ctx: Context, tx, req) => {
    // Updating configs requires a user identity to track authorship
    const currentUserEmail = requireUserEmail(req.identity);

    const currentUser = await tx.users.getByEmail(currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Get the config to check its project's requireProposals setting
    const config = await tx.configs.getById(req.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // Get the project to check requireProposals setting
    const project = await tx.projects.getById({
      id: config.projectId,
      currentUserEmail,
    });
    if (!project) {
      throw new BadRequestError('Project not found');
    }

    // Check if approval is required using the new per-environment logic
    if (project.requireProposals) {
      const currentVariants = await tx.configVariants.getByConfigId(req.configId);
      const currentMembers = await tx.configUsers.getByConfigId(req.configId);
      const currentEditorEmails = currentMembers
        .filter(m => m.role === 'editor')
        .map(m => m.user_email_normalized);
      const currentMaintainerEmails = currentMembers
        .filter(m => m.role === 'maintainer')
        .map(m => m.user_email_normalized);

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
        proposedDefaultVariant: req.defaultVariant,
        proposedEnvironmentVariants: req.environmentVariants,
        currentMembers: {
          editorEmails: currentEditorEmails,
          maintainerEmails: currentMaintainerEmails,
        },
        proposedMembers: {
          editorEmails: req.editorEmails,
          maintainerEmails: req.maintainerEmails,
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

    // Call configService.updateConfig with full state
    await tx.configService.updateConfig(ctx, {
      configId: req.configId,
      description: req.description,
      editorEmails: req.editorEmails,
      maintainerEmails: req.maintainerEmails,
      defaultVariant: req.defaultVariant,
      environmentVariants: req.environmentVariants,
      currentUser,
      reviewer: currentUser,
      prevVersion: req.prevVersion,
      originalProposalId: req.originalProposalId,
    });

    return {};
  };
}
