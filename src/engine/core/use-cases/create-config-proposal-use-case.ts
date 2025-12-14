import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {Override} from '../override-evaluator';
import {createAuditLogId} from '../stores/audit-log-store';
import {
  createConfigProposalId,
  createConfigProposalVariantId,
  type ConfigProposalId,
  type ConfigProposalVariant,
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
      // Deletion proposal
      await tx.configProposals.create({
        id: configProposalId,
        configId: req.configId,
        proposerId: currentUser.id,
        createdAt: deps.dateProvider.now(),
        rejectedAt: null,
        approvedAt: null,
        reviewerId: null,
        rejectionReason: null,
        rejectedInFavorOfProposalId: null,
        baseConfigVersion: config.version,
        // Original values (snapshot)
        originalMembers: currentMembers.map(m => ({
          email: m.user_email_normalized,
          role: m.role,
        })),
        originalDescription: config.description,
        originalValue: config.value,
        originalSchema: config.schema,
        originalOverrides: config.overrides,
        // For deletion, proposed values are same as original
        proposedDelete: true,
        proposedDescription: config.description,
        proposedMembers: currentMembers.map(m => ({
          email: m.user_email_normalized,
          role: m.role,
        })),
        proposedValue: config.value,
        proposedSchema: config.schema,
        proposedOverrides: config.overrides,
        message: req.message ?? null,
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
        proposerId: currentUser.id,
        createdAt: deps.dateProvider.now(),
        rejectedAt: null,
        approvedAt: null,
        reviewerId: null,
        rejectionReason: null,
        rejectedInFavorOfProposalId: null,
        baseConfigVersion: config.version,
        // Original values (snapshot)
        originalMembers: currentMembers.map(m => ({
          email: m.user_email_normalized,
          role: m.role,
        })),
        originalDescription: config.description,
        originalValue: config.value,
        originalSchema: config.schema,
        originalOverrides: config.overrides,
        // Proposed values
        proposedDelete: false,
        proposedDescription: req.description!,
        proposedMembers: proposedMembers,
        proposedValue: req.defaultVariant.value,
        proposedSchema: req.defaultVariant.schema,
        proposedOverrides: req.defaultVariant.overrides,
        message: req.message ?? null,
      });

      // Get all current environment variants to map them to config_variant_id
      // (Default variant is stored in configs table, not config_variants)
      const currentVariants = await tx.configVariants.getByConfigId(req.configId);

      // Create variant entries for the proposed environment-specific state
      const proposalVariants: ConfigProposalVariant[] = [];

      // Add environment variants
      for (const envVariant of req.environmentVariants) {
        proposalVariants.push({
          id: createConfigProposalVariantId(),
          proposalId: configProposalId,
          environmentId: envVariant.environmentId,
          useDefaultSchema: envVariant.useDefaultSchema ?? false,
          proposedValue: envVariant.value,
          proposedSchema: envVariant.schema ?? null,
          proposedOverrides: envVariant.overrides,
        });
      }

      await tx.configProposals.createVariants(proposalVariants);

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
          proposedVariants: proposalVariants.map(v => ({
            environmentId: v.environmentId,
            proposedValue: v.proposedValue,
            proposedSchema: v.proposedSchema,
            proposedOverrides: v.proposedOverrides,
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
