import assert from 'assert';
import type {Context} from '../context';
import {BadRequestError} from '../errors';
import type {Override} from '../override-condition-schemas';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigSchema, ConfigValue, NormalizedEmail} from '../zod';

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
  currentUserEmail: NormalizedEmail;
  prevVersion: number;
  originalProposalId?: string;
}

export interface UpdateConfigResponse {}

export function createUpdateConfigUseCase(): TransactionalUseCase<
  UpdateConfigRequest,
  UpdateConfigResponse
> {
  return async (ctx: Context, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Get the config to check its project's requireProposals setting
    const config = await tx.configs.getById(req.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // Get the project to check requireProposals setting
    const project = await tx.projects.getById({
      id: config.projectId,
      currentUserEmail: req.currentUserEmail,
    });
    if (!project) {
      throw new BadRequestError('Project not found');
    }

    if (project.requireProposals) {
      throw new BadRequestError(
        'Direct config changes are disabled. Please create a proposal instead.',
      );
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
