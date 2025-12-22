import assert from 'assert';
import {BadRequestError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import type {ConfigProposalId} from '../stores/config-proposal-store';
import type {ProjectId} from '../stores/project-store';
import type {TransactionalUseCase} from '../use-case';

export interface RejectConfigProposalRequest {
  proposalId: ConfigProposalId;
  identity: Identity;
  projectId: ProjectId;
}

export interface RejectConfigProposalResponse {}

export function createRejectConfigProposalUseCase(): TransactionalUseCase<
  RejectConfigProposalRequest,
  RejectConfigProposalResponse
> {
  return async (ctx, tx, req) => {
    // Rejecting proposals requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const proposal = await tx.configProposals.getById({
      id: req.proposalId,
      projectId: req.projectId,
    });

    if (!proposal) {
      throw new BadRequestError('Proposal not found');
    }

    const currentUser = await tx.users.getByEmail(currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Use proposalService to reject the proposal
    await tx.proposalService.rejectProposal({
      proposalId: req.proposalId,
      projectId: req.projectId,
      reviewer: currentUser,
      currentUserEmail,
    });

    return {};
  };
}
