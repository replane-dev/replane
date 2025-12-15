import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {Override} from '../override-evaluator';
import {createAuditLogId} from '../stores/audit-log-store';
import {
  createConfigProposalId,
  createConfigProposalMemberId,
  createConfigProposalVariantId,
  type ConfigProposalId,
} from '../stores/config-proposal-store';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigSchema, ConfigValue, NormalizedEmail} from '../zod';

export interface CreateConfigProposalRequest {
  projectId: string;
  configId: string;
  baseVersion: number;
  proposedDelete: boolean;
  // Full proposed state (required unless proposedDelete is true)
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
  message: string | null;
  currentUserEmail: NormalizedEmail;
}

export interface CreateConfigProposalResponse {
  configProposalId: ConfigProposalId;
}

export interface CreateConfigProposalUseCaseDeps {
  dateProvider: DateProvider;
}

export function createCreateConfigProposalUseCase(
  deps: CreateConfigProposalUseCaseDeps,
): TransactionalUseCase<CreateConfigProposalRequest, CreateConfigProposalResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.isWorkspaceMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    const config = await tx.configs.getById(req.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // Check if config version matches the base version
    if (config.version !== req.baseVersion) {
      throw new BadRequestError('Config was edited by another user. Please, refresh the page.', {
        code: 'CONFIG_VERSION_MISMATCH',
      });
    }

    // Validate the proposed state
    await tx.configService.validate(ctx, {
      projectId: config.projectId,
      description: req.description,
      defaultVariant: req.defaultVariant,
      environmentVariants: req.environmentVariants,
    });

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const configProposalId = createConfigProposalId();
    const currentMembers = await tx.configUsers.getByConfigId(config.id);

    if (req.proposedDelete) {
      await tx.configProposals.create({
        id: configProposalId,
        configId: req.configId,
        authorId: currentUser.id,
        createdAt: deps.dateProvider.now(),
        rejectedAt: null,
        approvedAt: null,
        reviewerId: null,
        rejectionReason: null,
        rejectedInFavorOfProposalId: null,
        baseConfigVersion: config.version,
        isDelete: true,
        description: config.description,
        value: config.value,
        schema: config.schema,
        overrides: config.overrides,
        message: req.message ?? null,
        variants: req.environmentVariants.map(x => ({
          id: createConfigProposalVariantId(),
          environmentId: x.environmentId,
          value: x.value,
          schema: x.schema,
          overrides: x.overrides,
          useDefaultSchema: x.useDefaultSchema,
        })),
        members: currentMembers.map(m => ({
          id: createConfigProposalMemberId(),
          email: m.user_email_normalized,
          role: m.role,
        })),
      });

      await tx.auditLogs.create({
        id: createAuditLogId(),
        createdAt: deps.dateProvider.now(),
        projectId: config.projectId,
        userId: currentUser.id,
        configId: config.id,
        payload: {
          type: 'config_proposal_created',
          proposalId: configProposalId,
          configId: config.id,
          proposedDelete: true,
          proposedDescription: undefined,
          proposedMembers: undefined,
          message: req.message,
        },
      });
    } else {
      // Normal proposal with full proposed state
      const proposedMembers = [
        ...req.editorEmails!.map(email => ({email, role: 'editor' as const})),
        ...req.maintainerEmails!.map(email => ({email, role: 'maintainer' as const})),
      ];

      await tx.configProposals.create({
        id: configProposalId,
        configId: req.configId,
        authorId: currentUser.id,
        createdAt: deps.dateProvider.now(),
        rejectedAt: null,
        approvedAt: null,
        reviewerId: null,
        rejectionReason: null,
        rejectedInFavorOfProposalId: null,
        baseConfigVersion: config.version,
        isDelete: false,
        description: req.description!,
        value: req.defaultVariant.value,
        schema: req.defaultVariant.schema,
        overrides: req.defaultVariant.overrides,
        message: req.message ?? null,
        variants: req.environmentVariants.map(v => ({
          id: createConfigProposalVariantId(),
          environmentId: v.environmentId,
          value: v.value,
          schema: v.schema ?? null,
          overrides: v.overrides,
          useDefaultSchema: v.useDefaultSchema ?? false,
        })),
        members: proposedMembers.map(m => ({
          id: createConfigProposalMemberId(),
          ...m,
        })),
      });

      await tx.auditLogs.create({
        id: createAuditLogId(),
        createdAt: deps.dateProvider.now(),
        projectId: config.projectId,
        userId: currentUser.id,
        configId: config.id,
        payload: {
          type: 'config_proposal_created',
          proposalId: configProposalId,
          configId: config.id,
          proposedDelete: false,
          proposedDescription: req.description!,
          proposedMembers: proposedMembers,
          proposedVariants: req.environmentVariants.map(v => ({
            environmentId: v.environmentId,
            proposedValue: v.value,
            proposedSchema: v.schema,
            proposedOverrides: v.overrides,
          })),
          message: req.message,
        },
      });
    }

    return {
      configProposalId,
    };
  };
}
