import assert from 'assert';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface RejectAllPendingConfigProposalsRequest {
  configId: string;
  currentUserEmail: NormalizedEmail;
}

export interface RejectAllPendingConfigProposalsResponse {}

export interface RejectAllPendingConfigProposalsUseCaseDeps {}

export function createRejectAllPendingConfigProposalsUseCase(
  deps: RejectAllPendingConfigProposalsUseCaseDeps,
): TransactionalUseCase<
  RejectAllPendingConfigProposalsRequest,
  RejectAllPendingConfigProposalsResponse
> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    await tx.configService.rejectAllPendingProposals({
      configId: req.configId,
      reviewer: currentUser,
    });

    return {};
  };
}
