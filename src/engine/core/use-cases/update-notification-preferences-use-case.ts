import {NotFoundError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import type {
  UserNotificationPreferences,
  UserNotificationPreferencesUpdate,
} from '../stores/user-notification-preferences-store';
import type {TransactionalUseCase} from '../use-case';

export interface UpdateNotificationPreferencesRequest {
  identity: Identity;
  preferences: UserNotificationPreferencesUpdate;
}

export type UpdateNotificationPreferencesResponse = Omit<
  UserNotificationPreferences,
  'userId' | 'createdAt' | 'updatedAt'
>;

export function createUpdateNotificationPreferencesUseCase(): TransactionalUseCase<
  UpdateNotificationPreferencesRequest,
  UpdateNotificationPreferencesResponse
> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    // Get the current user
    const user = await tx.users.getByEmail(currentUserEmail);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Update preferences
    const updated = await tx.userNotificationPreferences.upsert({
      userId: user.id,
      preferences: req.preferences,
      now: tx.dateProvider.now(),
    });

    return {
      proposalWaitingForReview: updated.proposalWaitingForReview,
      proposalApproved: updated.proposalApproved,
      proposalRejected: updated.proposalRejected,
    };
  };
}
