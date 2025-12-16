import assert from 'assert';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface RejectAllPendingConfigProposalsRequest {
  configId: string;
  currentUserEmail: NormalizedEmail;
}

export interface RejectAllPendingConfigProposalsResponse {}

export function createRejectAllPendingConfigProposalsUseCase(): TransactionalUseCase<
  RejectAllPendingConfigProposalsRequest,
  RejectAllPendingConfigProposalsResponse
> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    await tx.proposalService.rejectAllPendingProposals({
      configId: req.configId,
      reviewer: currentUser,
    });

    return {};
  };
}
