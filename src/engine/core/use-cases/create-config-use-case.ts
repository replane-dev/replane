import assert from 'node:assert';
import {v7 as uuidV7} from 'uuid';
import type {NewConfigUser} from '../config-user-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';
import {validateAgainstJsonSchema} from '../utils';

export interface CreateConfigRequest {
  name: string;
  value: any;
  description: string;
  schema: unknown;
  currentUserEmail: string;
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
    const existingConfig = await tx.configs.get(req.name);
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

    const configId = uuidV7();
    await tx.configs.put({
      id: configId,
      name: req.name,
      value: req.value,
      schema: req.schema,
      description: req.description,
      createdAt: deps.dateProvider.now(),
      updatedAt: deps.dateProvider.now(),
      creatorId: currentUser.id,
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
