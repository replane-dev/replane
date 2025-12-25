import {type Identity} from '../identity';
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
    await tx.proposalService.rejectAllPendingProposals({
      configId: req.configId,
      reviewer: req.identity,
    });

    return {};
  };
}
