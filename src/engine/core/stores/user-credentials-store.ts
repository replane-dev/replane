import type {Kysely} from 'kysely';
import type {DB} from '../db';

export interface UserCredentials {
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UserCredentialsStore {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Get credentials by email address.
   *
   * @param email - The email address to look up
   * @returns The credentials if found, null otherwise
   */
  async getByEmail(email: string): Promise<UserCredentials | null> {
    const result = await this.db
      .selectFrom('user_credentials')
      .selectAll()
      .where('email', '=', email.toLowerCase())
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return {
      email: result.email,
      passwordHash: result.password_hash,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  /**
   * Create new credentials for a user.
   *
   * @param email - The email address
   * @param passwordHash - The hashed password
   */
  async create(email: string, passwordHash: string): Promise<void> {
    const now = new Date();
    await this.db
      .insertInto('user_credentials')
      .values({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  /**
   * Check if credentials exist for an email.
   *
   * @param email - The email address to check
   * @returns true if credentials exist
   */
  async exists(email: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('user_credentials')
      .select('email')
      .where('email', '=', email.toLowerCase())
      .executeTakeFirst();

    return !!result;
  }

  /**
   * Update password for a user.
   *
   * @param email - The email address
   * @param passwordHash - The new hashed password
   */
  async updatePassword(email: string, passwordHash: string): Promise<void> {
    await this.db
      .updateTable('user_credentials')
      .set({
        password_hash: passwordHash,
        updated_at: new Date(),
      })
      .where('email', '=', email.toLowerCase())
      .execute();
  }

  /**
   * Delete credentials for a user.
   *
   * @param email - The email address
   */
  async delete(email: string): Promise<void> {
    await this.db
      .deleteFrom('user_credentials')
      .where('email', '=', email.toLowerCase())
      .execute();
  }
}

