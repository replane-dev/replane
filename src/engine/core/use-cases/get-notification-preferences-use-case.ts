import type {
  UserNotificationPreferences,
} from '../stores/user-notification-preferences-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetNotificationPreferencesRequest {
  currentUserEmail: NormalizedEmail;
}

export type GetNotificationPreferencesResponse = Omit<
  UserNotificationPreferences,
  'userId' | 'createdAt' | 'updatedAt'
>;

export function createGetNotificationPreferencesUseCase(): TransactionalUseCase<
  GetNotificationPreferencesRequest,
  GetNotificationPreferencesResponse
> {
  return async (ctx, tx, req) => {
    // Get the current user
    const user = await tx.users.getByEmail(req.currentUserEmail);
    if (!user) {
      // Return defaults for unauthenticated or unknown users
      return {
        proposalWaitingForReview: true,
        proposalApproved: true,
        proposalRejected: true,
      };
    }

    // Get preferences with defaults
    const preferences = await tx.userNotificationPreferences.getByUserIdWithDefaults(user.id);

    return {
      proposalWaitingForReview: preferences.proposalWaitingForReview,
      proposalApproved: preferences.proposalApproved,
      proposalRejected: preferences.proposalRejected,
    };
  };
}

