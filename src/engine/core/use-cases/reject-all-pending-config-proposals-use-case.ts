import {type Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';

export interface RejectAllPendingConfigProposalsRequest {
  configId: string;
  projectId: string;
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
      projectId: req.projectId,
      reviewer: req.identity,
    });

    return {};
  };
}
