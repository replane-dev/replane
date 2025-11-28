import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import {createConfigProposalId, type ConfigProposalId} from '../config-proposal-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface CreateConfigProposalRequest {
  configId: string;
  baseVersion: number;
  proposedDelete?: boolean;
  proposedDescription?: {newDescription: string};
  proposedMembers?: {newMembers: Array<{email: string; role: 'maintainer' | 'editor'}>};
  message?: string;
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

    // Check if config version matches the base version
    if (config.version !== req.baseVersion) {
      throw new BadRequestError('Config was edited by another user. Please, refresh the page.', {
        code: 'CONFIG_VERSION_MISMATCH',
      });
    }

    // At least one field must be proposed
    if (
      req.proposedDelete !== true &&
      req.proposedDescription === undefined &&
      req.proposedMembers === undefined
    ) {
      throw new BadRequestError('At least one field must be proposed');
    }

    // Deletion proposals must not include other fields
    if (req.proposedDelete) {
      if (req.proposedDescription || req.proposedMembers) {
        throw new BadRequestError('Deletion proposal cannot include other changes');
      }
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const configProposalId = createConfigProposalId();
    const currentMembers = await tx.configUsers.getByConfigId(config.id);

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
      originalMembers: currentMembers.map(m => ({
        email: m.user_email_normalized,
        role: m.role,
      })),
      originalDescription: config.description,
      proposedDelete: req.proposedDelete === true,
      proposedDescription: req.proposedDescription ? req.proposedDescription.newDescription : null,
      proposedMembers: req.proposedMembers ? {newMembers: req.proposedMembers.newMembers} : null,
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
        proposedDelete: req.proposedDelete,
        proposedDescription: req.proposedDescription?.newDescription,
        proposedMembers: req.proposedMembers
          ? {newMembers: req.proposedMembers.newMembers}
          : undefined,
        message: req.message,
      },
    });

    return {
      configProposalId,
    };
  };
}
