import assert from 'assert';
import {createAuditMessageId} from '../audit-message-store';
import {createConfigProposalId, type ConfigProposalId} from '../config-proposal-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import {validateAgainstJsonSchema} from '../utils';
import type {NormalizedEmail} from '../zod';

export interface CreateConfigProposalRequest {
  configId: string;
  proposedValue?: {newValue: unknown};
  proposedDescription?: {newDescription: string};
  proposedSchema?: {newSchema: unknown};
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
    const config = await tx.configs.getById(req.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // At least one field must be proposed
    if (
      req.proposedValue === undefined &&
      req.proposedDescription === undefined &&
      req.proposedSchema === undefined
    ) {
      throw new BadRequestError('At least one field must be proposed');
    }

    const finalSchema = req.proposedSchema ? req.proposedSchema.newSchema : config.schema;

    const finalValue = req.proposedValue ? req.proposedValue.newValue : config.value;

    if (finalSchema !== null) {
      const result = validateAgainstJsonSchema(finalValue, finalSchema as any);
      if (!result.ok) {
        throw new BadRequestError(`Value does not match schema: ${result.errors.join('; ')}`);
      }
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const configProposalId = createConfigProposalId();
    await tx.configProposals.create({
      id: configProposalId,
      configId: req.configId,
      proposerId: currentUser.id,
      createdAt: deps.dateProvider.now(),
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      baseConfigVersion: config.version,
      proposedValue: req.proposedValue ? {newValue: req.proposedValue.newValue} : null,
      proposedDescription: req.proposedDescription ? req.proposedDescription.newDescription : null,
      proposedSchema: req.proposedSchema ? {newSchema: req.proposedSchema.newSchema} : null,
    });

    await tx.auditMessages.create({
      id: createAuditMessageId(),
      createdAt: deps.dateProvider.now(),
      projectId: config.projectId,
      userId: currentUser.id,
      configId: config.id,
      payload: {
        type: 'config_proposal_created',
        proposalId: configProposalId,
        configId: config.id,
        proposedValue: {newValue: req.proposedValue?.newValue},
        proposedDescription: req.proposedDescription?.newDescription,
        proposedSchema: {newSchema: req.proposedSchema?.newSchema},
      },
    });

    return {
      configProposalId,
    };
  };
}
