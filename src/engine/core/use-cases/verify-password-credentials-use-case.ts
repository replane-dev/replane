import {isEmailDomainAllowed} from '@/lib/email-domain-validator';
import crypto from 'crypto';
import {ForbiddenError} from '../errors';
import {Lazy} from '../lazy';
import type {Logger} from '../logger';
import {hashPassword, verifyPassword} from '../password-utils';
import {UserCredentialsStore} from '../stores/user-credentials-store';
import type {TransactionalUseCase} from '../use-case';
import {bytesToHex} from '../utils';

export interface VerifyPasswordCredentialsRequest {
  email: string;
  password: string;
}

export interface VerifyPasswordCredentialsResponse {
  id: number;
  email: string;
  name: string | null;
  image: string | null;
}

export interface VerifyPasswordCredentialsUseCaseOptions {
  passwordAuthEnabled: boolean;
  logger: Logger;
}

// Pre-computed dummy hash for timing attack prevention
const DUMMY_PASSWORD_HASH = new Lazy(async () => {
  const random = crypto.getRandomValues(new Uint8Array(32));
  return await hashPassword(bytesToHex(random));
});

export function createVerifyPasswordCredentialsUseCase(
  options: VerifyPasswordCredentialsUseCaseOptions,
): TransactionalUseCase<
  VerifyPasswordCredentialsRequest,
  VerifyPasswordCredentialsResponse | null
> {
  const {logger} = options;

  return async (ctx, tx, req) => {
    // Check if password auth is enabled
    if (!options.passwordAuthEnabled) {
      throw new ForbiddenError('Password authentication is not enabled');
    }

    const email = req.email.toLowerCase();

    // Check email domain restrictions
    if (!isEmailDomainAllowed(email)) {
      return null;
    }

    // Create credentials store
    const credentialsStore = new UserCredentialsStore(tx.db);

    // Look up credentials
    const userCredentials = await credentialsStore.getByEmail(email);

    // SECURITY: Always verify password to prevent timing-based user enumeration
    // If user doesn't exist, verify against a dummy hash to maintain constant time
    const isValid = await verifyPassword(
      req.password,
      userCredentials?.passwordHash ?? (await DUMMY_PASSWORD_HASH.get()),
    );

    if (!userCredentials || !isValid) {
      logger.warn(ctx, {
        msg: 'Auth: login failed - invalid credentials',
        email,
        event: 'auth.login.failed',
        reason: !userCredentials ? 'user_not_found' : 'invalid_password',
      });
      return null;
    }

    // Get the user from the users table
    const user = await tx.users.getByEmail(email);
    if (!user) {
      // User credentials exist but no user record - shouldn't happen normally
      logger.error(ctx, {
        msg: 'Auth: login failed - credentials exist but user record missing',
        email,
        event: 'auth.login.error',
      });
      return null;
    }

    logger.info(ctx, {
      msg: 'Auth: login successful',
      email,
      userId: user.id,
      event: 'auth.login.success',
    });

    return {
      id: user.id,
      email: user.email ?? email,
      name: user.name,
      image: user.image,
    };
  };
}
