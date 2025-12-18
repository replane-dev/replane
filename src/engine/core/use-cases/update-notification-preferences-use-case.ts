import {NotFoundError} from '../errors';
import type {
  UserNotificationPreferences,
  UserNotificationPreferencesUpdate,
} from '../stores/user-notification-preferences-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface UpdateNotificationPreferencesRequest {
  currentUserEmail: NormalizedEmail;
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
    // Get the current user
    const user = await tx.users.getByEmail(req.currentUserEmail);
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

