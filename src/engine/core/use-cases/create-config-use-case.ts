import assert from 'node:assert';
import {createConfigId} from '../config-store';
import type {NewConfigUser} from '../config-user-store';
import {createConfigVersionId} from '../config-version-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';
import {validateAgainstJsonSchema} from '../utils';
import type {NormalizedEmail} from '../zod';

export interface CreateConfigRequest {
  name: string;
  value: any;
  description: string;
  schema: unknown;
  currentUserEmail: NormalizedEmail;
  editorEmails: string[];
  ownerEmails: string[];
}

export interface CreateConfigResponse {}

export interface CreateConfigUseCaseDeps {
  dateProvider: DateProvider;
}

export function createCreateConfigUseCase(
  deps: CreateConfigUseCaseDeps,
): UseCase<CreateConfigRequest, CreateConfigResponse> {
  return async (ctx, tx, req) => {
    const existingConfig = await tx.configs.getByName(req.name);
    if (existingConfig) {
      throw new BadRequestError('Config with this name already exists');
    }

    if (req.schema !== null) {
      const result = validateAgainstJsonSchema(req.value, req.schema as any);
      if (!result.ok) {
        throw new BadRequestError(
          `Config value does not match schema: ${result.errors.join('; ')}`,
        );
      }
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const configId = createConfigId();
    await tx.configs.create({
      id: configId,
      name: req.name,
      value: req.value,
      schema: req.schema,
      description: req.description,
      createdAt: deps.dateProvider.now(),
      updatedAt: deps.dateProvider.now(),
      creatorId: currentUser.id,
      version: 1,
    });

    await tx.configVersions.create({
      configId,
      createdAt: deps.dateProvider.now(),
      description: req.description,
      id: createConfigVersionId(),
      name: req.name,
      schema: req.schema,
      value: req.value,
      version: 1,
    });

    await tx.configUsers.create(
      configId,
      req.editorEmails
        .map(
          (email): NewConfigUser => ({
            email,
            role: 'editor',
          }),
        )
        .concat(
          req.ownerEmails.map(
            (email): NewConfigUser => ({
              email,
              role: 'owner',
            }),
          ),
        ),
    );

    return {};
  };
}
