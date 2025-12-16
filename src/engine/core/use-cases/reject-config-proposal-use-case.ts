import assert from 'assert';
import {BadRequestError} from '../errors';
import type {ConfigProposalId} from '../stores/config-proposal-store';
import type {ProjectId} from '../stores/project-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface RejectConfigProposalRequest {
  proposalId: ConfigProposalId;
  currentUserEmail: NormalizedEmail;
  projectId: ProjectId;
}

export interface RejectConfigProposalResponse {}

export function createRejectConfigProposalUseCase(): TransactionalUseCase<
  RejectConfigProposalRequest,
  RejectConfigProposalResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    const proposal = await tx.configProposals.getById({
      id: req.proposalId,
      projectId: req.projectId,
    });

    if (!proposal) {
      throw new BadRequestError('Proposal not found');
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Use proposalService to reject the proposal
    await tx.proposalService.rejectProposal({
      proposalId: req.proposalId,
      projectId: req.projectId,
      reviewer: currentUser,
      currentUserEmail: req.currentUserEmail,
    });

    return {};
  };
}
