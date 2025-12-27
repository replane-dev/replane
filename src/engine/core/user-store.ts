import assert from 'assert';
import {Kysely, type Selectable} from 'kysely';
import {z} from 'zod';
import type {DB, Users} from './db';

export function User() {
  return z.object({
    email: z.string().nullable(),
    id: z.number(),
    name: z.string().nullable(),
    emailVerified: z.date().nullable(),
    image: z.string().nullable(),
  });
}

export interface User extends z.infer<ReturnType<typeof User>> {}

export class UserStore {
  constructor(private readonly db: Kysely<DB>) {}

  async insert(user: Omit<User, 'id'>): Promise<User> {
    const result = await this.db
      .insertInto('users')
      .values(user)
      .returning(['id', 'email', 'name', 'emailVerified', 'image'])
      .executeTakeFirst();

    assert(result, 'Failed to insert user');

    return mapUser(result);
  }

  async getById(userId: number): Promise<User | undefined> {
    const result = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', userId)
      .executeTakeFirst();
    if (result) {
      return mapUser(result);
    }

    return undefined;
  }

  async getByIds(userIds: number[]): Promise<User[]> {
    if (userIds.length === 0) {
      return [];
    }

    const results = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', 'in', userIds)
      .execute();
    return results.map(mapUser);
  }

  async getByEmail(email: string): Promise<User | undefined> {
    const result = await this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email.toLowerCase())
      .executeTakeFirst();
    if (result) {
      return mapUser(result);
    }

    return undefined;
  }

  async deleteById(userId: number): Promise<void> {
    await this.db.deleteFrom('users').where('id', '=', userId).execute();
  }

  async updateById(params: {
    id: number;
    name?: string | null;
    image?: string | null;
  }): Promise<User | undefined> {
    const updates: Partial<{name: string | null; image: string | null}> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.image !== undefined) updates.image = params.image;

    if (Object.keys(updates).length === 0) {
      return this.getById(params.id);
    }

    const result = await this.db
      .updateTable('users')
      .set(updates)
      .where('id', '=', params.id)
      .returning(['id', 'email', 'name', 'emailVerified', 'image'])
      .executeTakeFirst();

    return result ? mapUser(result) : undefined;
  }
}

function mapUser(user: Selectable<Users>): User {
  return {
    email: user.email,
    id: user.id,
    name: user.name,
    emailVerified: user.emailVerified,
    image: user.image,
  };
}
