import type {Kysely} from 'kysely';
import type {DB} from './db';
import {normalizeUserEmail} from './utils';

export type ConfigUserRole = 'owner' | 'editor';

export interface NewConfigUser {
  email: string;
  role: ConfigUserRole;
}

export class ConfigUserStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getByConfigId(configId: string) {
    return await this.db
      .selectFrom('config_users')
      .selectAll()
      .where('config_id', '=', configId)
      .execute();
  }

  async create(configId: string, configUsers: NewConfigUser[]) {
    if (configUsers.length === 0) {
      return;
    }
    await this.db
      .insertInto('config_users')
      .values(
        configUsers.map(({email, role}) => ({
          config_id: configId,
          user_email_normalized: normalizeUserEmail(email),
          role,
        })),
      )
      .execute();
  }

  async delete(configId: string, userEmail: string) {
    await this.db
      .deleteFrom('config_users')
      .where('config_id', '=', configId)
      .where('user_email_normalized', '=', normalizeUserEmail(userEmail))
      .execute();
  }
}
