import type {Kysely} from 'kysely';
import type {DB} from '../db';

export interface UserNotificationPreferences {
  userId: number;
  proposalWaitingForReview: boolean;
  proposalApproved: boolean;
  proposalRejected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserNotificationPreferencesUpdate {
  proposalWaitingForReview?: boolean;
  proposalApproved?: boolean;
  proposalRejected?: boolean;
}

/**
 * Default preferences when user has no saved preferences
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<
  UserNotificationPreferences,
  'userId' | 'createdAt' | 'updatedAt'
> = {
  proposalWaitingForReview: true,
  proposalApproved: true,
  proposalRejected: true,
};

export class UserNotificationPreferencesStore {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Get notification preferences for a user.
   * Returns null if user has no preferences set (defaults should be used).
   */
  async getByUserId(userId: number): Promise<UserNotificationPreferences | null> {
    const row = await this.db
      .selectFrom('user_notification_preferences')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      userId: row.user_id,
      proposalWaitingForReview: row.proposal_waiting_for_review,
      proposalApproved: row.proposal_approved,
      proposalRejected: row.proposal_rejected,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get notification preferences for a user, returning defaults if not set.
   */
  async getByUserIdWithDefaults(userId: number): Promise<UserNotificationPreferences> {
    const preferences = await this.getByUserId(userId);
    if (preferences) {
      return preferences;
    }

    const now = new Date();
    return {
      userId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get notification preferences for multiple users.
   * Returns a map of userId to preferences (using defaults for users without saved preferences).
   */
  async getByUserIds(userIds: number[]): Promise<Map<number, UserNotificationPreferences>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .selectFrom('user_notification_preferences')
      .selectAll()
      .where('user_id', 'in', userIds)
      .execute();

    const result = new Map<number, UserNotificationPreferences>();
    const now = new Date();

    // Add found preferences
    for (const row of rows) {
      result.set(row.user_id, {
        userId: row.user_id,
        proposalWaitingForReview: row.proposal_waiting_for_review,
        proposalApproved: row.proposal_approved,
        proposalRejected: row.proposal_rejected,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    // Add defaults for users without preferences
    for (const userId of userIds) {
      if (!result.has(userId)) {
        result.set(userId, {
          userId,
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return result;
  }

  /**
   * Create or update notification preferences for a user.
   */
  async upsert(params: {
    userId: number;
    preferences: UserNotificationPreferencesUpdate;
    now: Date;
  }): Promise<UserNotificationPreferences> {
    const {userId, preferences, now} = params;

    // Check if preferences exist
    const existing = await this.getByUserId(userId);

    if (existing) {
      // Update existing preferences
      await this.db
        .updateTable('user_notification_preferences')
        .set({
          proposal_waiting_for_review:
            preferences.proposalWaitingForReview ?? existing.proposalWaitingForReview,
          proposal_approved: preferences.proposalApproved ?? existing.proposalApproved,
          proposal_rejected: preferences.proposalRejected ?? existing.proposalRejected,
          updated_at: now,
        })
        .where('user_id', '=', userId)
        .execute();

      return {
        userId,
        proposalWaitingForReview:
          preferences.proposalWaitingForReview ?? existing.proposalWaitingForReview,
        proposalApproved: preferences.proposalApproved ?? existing.proposalApproved,
        proposalRejected: preferences.proposalRejected ?? existing.proposalRejected,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
    } else {
      // Create new preferences
      const newPreferences: UserNotificationPreferences = {
        userId,
        proposalWaitingForReview:
          preferences.proposalWaitingForReview ?? DEFAULT_NOTIFICATION_PREFERENCES.proposalWaitingForReview,
        proposalApproved:
          preferences.proposalApproved ?? DEFAULT_NOTIFICATION_PREFERENCES.proposalApproved,
        proposalRejected:
          preferences.proposalRejected ?? DEFAULT_NOTIFICATION_PREFERENCES.proposalRejected,
        createdAt: now,
        updatedAt: now,
      };

      await this.db
        .insertInto('user_notification_preferences')
        .values({
          user_id: newPreferences.userId,
          proposal_waiting_for_review: newPreferences.proposalWaitingForReview,
          proposal_approved: newPreferences.proposalApproved,
          proposal_rejected: newPreferences.proposalRejected,
          created_at: newPreferences.createdAt,
          updated_at: newPreferences.updatedAt,
        })
        .execute();

      return newPreferences;
    }
  }
}

