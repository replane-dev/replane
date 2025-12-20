import {isEmailDomainAllowed, isRegistrationDisabled} from '@/environment';
import {BadRequestError, ForbiddenError} from '../errors';
import type {Logger} from '../logger';
import {hashPassword, validatePassword} from '../password-utils';
import {UserCredentialsStore} from '../stores/user-credentials-store';
import type {TransactionalUseCase} from '../use-case';

export interface RegisterWithPasswordRequest {
  email: string;
  password: string;
  name?: string;
}

export interface RegisterWithPasswordResponse {
  success: boolean;
  email: string;
  userId: number;
}

export interface RegisterWithPasswordUseCaseOptions {
  passwordAuthEnabled: boolean;
  logger: Logger;
}

export function createRegisterWithPasswordUseCase(
  options: RegisterWithPasswordUseCaseOptions,
): TransactionalUseCase<RegisterWithPasswordRequest, RegisterWithPasswordResponse> {
  const {logger} = options;

  return async (ctx, tx, req) => {
    // Check if password auth is enabled (unless bypassed for initial setup)
    if (!options.passwordAuthEnabled) {
      throw new ForbiddenError('Password authentication is not enabled');
    }

    // Check if registration is disabled
    if (isRegistrationDisabled()) {
      logger.warn(ctx, {
        msg: 'Auth: registration blocked - registration is disabled',
        email: req.email,
        event: 'auth.register.disabled',
      });
      throw new ForbiddenError('Registration is disabled');
    }

    const email = req.email.toLowerCase();

    // Check email domain restrictions
    if (!isEmailDomainAllowed(email)) {
      logger.warn(ctx, {
        msg: 'Auth: registration blocked - email domain not allowed',
        email,
        event: 'auth.register.domain_blocked',
      });
      throw new ForbiddenError('This email domain is not allowed');
    }

    // Validate password
    const passwordError = validatePassword(req.password);
    if (passwordError) {
      throw new BadRequestError(passwordError);
    }

    // Create credentials store
    const credentialsStore = new UserCredentialsStore(tx.db);

    // Check if credentials already exist
    const existingCredentials = await credentialsStore.exists(email);
    if (existingCredentials) {
      logger.warn(ctx, {
        msg: 'Auth: registration failed - credentials already exist',
        email,
        event: 'auth.register.duplicate',
      });
      throw new BadRequestError('An account with this email already exists');
    }

    // Check if user already exists (may have signed up via OAuth)
    const existingUser = await tx.users.getByEmail(email);

    if (existingUser) {
      logger.warn(ctx, {
        msg: 'Auth: registration failed - user already exists (OAuth)',
        email,
        event: 'auth.register.duplicate_oauth',
      });
      throw new BadRequestError(
        'An account with this email already exists. Try signing in instead.',
      );
    }

    // Hash the password
    const passwordHash = await hashPassword(req.password);

    // Create user in the users table (next-auth managed)
    const now = tx.dateProvider.now();
    const newUser = await tx.users.insert({
      email: email,
      name: req.name || null,
      emailVerified: now, // Consider verified since they provided the password
      image: null,
    });

    // Store the credentials
    await credentialsStore.create(email, passwordHash);

    logger.info(ctx, {
      msg: 'Auth: registration successful',
      email,
      userId: newUser.id,
      event: 'auth.register.success',
    });

    return {
      success: true,
      email: email,
      userId: newUser.id,
    };
  };
}
