import assert from 'assert';
import {requireUserEmail, type Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';

export interface RejectAllPendingConfigProposalsRequest {
  configId: string;
  identity: Identity;
}

export interface RejectAllPendingConfigProposalsResponse {}

export function createRejectAllPendingConfigProposalsUseCase(): TransactionalUseCase<
  RejectAllPendingConfigProposalsRequest,
  RejectAllPendingConfigProposalsResponse
> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    const currentUser = await tx.users.getByEmail(currentUserEmail);
    assert(currentUser, 'Current user not found');

    await tx.proposalService.rejectAllPendingProposals({
      configId: req.configId,
      reviewer: currentUser,
    });

    return {};
  };
}
