import assert from 'assert';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface RejectAllPendingConfigVariantProposalsRequest {
  configVariantId: string;
  currentUserEmail: NormalizedEmail;
}

export interface RejectAllPendingConfigVariantProposalsResponse {}

export interface RejectAllPendingConfigVariantProposalsUseCaseDeps {}

export function createRejectAllPendingConfigVariantProposalsUseCase({}: RejectAllPendingConfigVariantProposalsUseCaseDeps): TransactionalUseCase<
  RejectAllPendingConfigVariantProposalsRequest,
  RejectAllPendingConfigVariantProposalsResponse
> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    await tx.configService.rejectAllPendingVariantProposals({
      configVariantId: req.configVariantId,
      reviewer: currentUser,
    });

    return {};
  };
}

