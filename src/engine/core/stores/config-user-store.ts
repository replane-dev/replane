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

  async getByConfigIdAndEmail(params: {configId: string; userEmail: string; projectId: string}) {
    return await this.db
      .selectFrom('config_users')
      .innerJoin('configs', 'configs.id', 'config_users.config_id')
      .selectAll('config_users')
      .where('config_users.config_id', '=', params.configId)
      .where('config_users.user_email_normalized', '=', normalizeEmail(params.userEmail))
      .where('configs.project_id', '=', params.projectId)
      .executeTakeFirst();
  }

  async getByConfigId(params: {configId: string; projectId: string}) {
    return await this.db
      .selectFrom('config_users')
      .innerJoin('configs', 'configs.id', 'config_users.config_id')
      .selectAll('config_users')
      .where('config_users.config_id', '=', params.configId)
      .where('configs.project_id', '=', params.projectId)
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

  async delete(params: {configId: string; userEmail: string; projectId: string}) {
    await this.db
      .deleteFrom('config_users')
      .where('config_id', '=', params.configId)
      .where('user_email_normalized', '=', normalizeEmail(params.userEmail))
      .where(eb =>
        eb.exists(
          eb
            .selectFrom('configs')
            .select('configs.id')
            .where('configs.id', '=', eb.ref('config_users.config_id'))
            .where('configs.project_id', '=', params.projectId),
        ),
      )
      .execute();
  }
}
