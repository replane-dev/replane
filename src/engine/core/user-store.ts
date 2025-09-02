import {Kysely, type Selectable} from 'kysely';
import {z} from 'zod';
import type {DB, Users} from './db';

export function User() {
  return z.object({
    email: z.string().nullable(),
    id: z.number(),
    name: z.string().nullable(),
  });
}

export interface User extends z.infer<ReturnType<typeof User>> {}

export class UserStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(userId: number): Promise<User | undefined> {
    const result = await this.db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst();
    if (result) {
      return mapUser(result);
    }

    return undefined;
  }

  async getByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
    if (result) {
      return mapUser(result);
    }

    return undefined;
  }
}

function mapUser(user: Selectable<Users>): User {
  return {
    email: user.email,
    id: user.id,
    name: user.name,
  };
}
