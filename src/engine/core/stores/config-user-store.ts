import type {Kysely} from 'kysely';
import type {ConfigUserRole, DB} from '../db';
import {normalizeEmail} from '../utils';

export interface NewConfigUser {
  configId: string;
  email: string;
  role: ConfigUserRole;
  createdAt: Date;
  updatedAt: Date;
}

export class ConfigUserStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getByConfigIdAndEmail(params: {configId: string; userEmail: string}) {
    return await this.db
      .selectFrom('config_users')
      .selectAll()
      .where('config_id', '=', params.configId)
      .where('user_email_normalized', '=', normalizeEmail(params.userEmail))
      .executeTakeFirst();
  }

  async getByConfigId(configId: string) {
    return await this.db
      .selectFrom('config_users')
      .selectAll()
      .where('config_id', '=', configId)
      .execute();
  }

  async create(configUsers: NewConfigUser[]) {
    if (configUsers.length === 0) {
      return;
    }
    await this.db
      .insertInto('config_users')
      .values(
        configUsers.map(x => ({
          config_id: x.configId,
          user_email_normalized: normalizeEmail(x.email),
          role: x.role,
          created_at: x.createdAt,
          updated_at: x.updatedAt,
        })),
      )
      .execute();
  }

  async delete(configId: string, userEmail: string) {
    await this.db
      .deleteFrom('config_users')
      .where('config_id', '=', configId)
      .where('user_email_normalized', '=', normalizeEmail(userEmail))
      .execute();
  }
}
