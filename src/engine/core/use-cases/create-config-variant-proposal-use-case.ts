import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import {
  createConfigVariantProposalId,
  type ConfigVariantProposalId,
} from '../config-variant-proposal-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {Override} from '../override-evaluator';
import type {TransactionalUseCase} from '../use-case';
import {validateAgainstJsonSchema} from '../utils';
import {validateOverrideReferences} from '../validate-override-references';
import type {NormalizedEmail} from '../zod';

export interface CreateConfigVariantProposalRequest {
  configVariantId: string;
  baseVersion: number;
  proposedValue?: {newValue: unknown};
  proposedSchema?: {newSchema: unknown | null};
  proposedOverrides?: {newOverrides: Override[]};
  message?: string;
  currentUserEmail: NormalizedEmail;
}

export interface CreateConfigVariantProposalResponse {
  configVariantProposalId: ConfigVariantProposalId;
}

export interface CreateConfigVariantProposalUseCaseDeps {
  dateProvider: DateProvider;
}

export function createCreateConfigVariantProposalUseCase(
  deps: CreateConfigVariantProposalUseCaseDeps,
): TransactionalUseCase<CreateConfigVariantProposalRequest, CreateConfigVariantProposalResponse> {
  return async (ctx, tx, req) => {
    const configVariant = await tx.configVariants.getById(req.configVariantId);
    if (!configVariant) {
      throw new BadRequestError('Config variant not found');
    }

    // Get config for project ID and audit log
    const config = await tx.configs.getById(configVariant.configId);
    assert(config, 'Config not found');

    // Check if variant version matches the base version
    if (configVariant.version !== req.baseVersion) {
      throw new BadRequestError(
        'Config variant was edited by another user. Please, refresh the page.',
        {
          code: 'CONFIG_VARIANT_VERSION_MISMATCH',
        },
      );
    }

    // At least one field must be proposed
    if (
      req.proposedValue === undefined &&
      req.proposedSchema === undefined &&
      req.proposedOverrides === undefined
    ) {
      throw new BadRequestError('At least one field must be proposed');
    }

    // Determine the schema to validate against
    const schemaToValidate =
      req.proposedSchema !== undefined ? req.proposedSchema.newSchema : configVariant.schema;

    // Determine the value to validate
    const valueToValidate =
      req.proposedValue !== undefined ? req.proposedValue.newValue : configVariant.value;

    // Validate value against schema (only if schema is not null)
    if (schemaToValidate !== null && valueToValidate !== undefined) {
      // TODO: validate that the schema is valid JSON Schema
      const validation = validateAgainstJsonSchema(valueToValidate, schemaToValidate as any);
      if (!validation.ok) {
        throw new BadRequestError(
          `Proposed value does not match schema: ${validation.errors.join(', ')}`,
        );
      }
    }

    // Validate override references if overrides are proposed
    if (req.proposedOverrides) {
      validateOverrideReferences({
        overrides: req.proposedOverrides.newOverrides,
        configProjectId: config.projectId,
      });
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const configVariantProposalId = createConfigVariantProposalId();

    await tx.configVariantProposals.create({
      id: configVariantProposalId,
      configVariantId: req.configVariantId,
      baseVariantVersion: configVariant.version,
      proposerId: currentUser.id,
      createdAt: deps.dateProvider.now(),
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: req.proposedValue?.newValue,
      proposedSchema: req.proposedSchema !== undefined ? req.proposedSchema.newSchema : undefined,
      proposedOverrides: req.proposedOverrides?.newOverrides,
      message: req.message ?? null,
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: deps.dateProvider.now(),
      projectId: config.projectId,
      userId: currentUser.id,
      configId: config.id,
      payload: {
        type: 'config_variant_proposal_created',
        proposalId: configVariantProposalId,
        configVariantId: req.configVariantId,
        configId: config.id,
        proposedValue: req.proposedValue ? {newValue: req.proposedValue.newValue} : undefined,
        proposedSchema:
          req.proposedSchema !== undefined ? {newSchema: req.proposedSchema.newSchema} : undefined,
        proposedOverrides: req.proposedOverrides
          ? {newOverrides: req.proposedOverrides.newOverrides}
          : undefined,
        message: req.message,
      },
    });

    return {
      configVariantProposalId,
    };
  };
}
