import type {DateProvider} from '../date-provider';
import type {ConfigUserRole} from '../db';
import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';
import {validateAgainstJsonSchema} from '../utils';

export interface UpdateConfigRequest {
  configName: string;
  value: any;
  schema: any;
  description?: string;
  currentUserEmail: string;
  editorEmails: string[];
  ownerEmails: string[];
}

export interface UpdateConfigResponse {}

export interface UpdateConfigUseCaseDeps {
  dateProvider: DateProvider;
}

export function createUpdateConfigUseCase(
  deps: UpdateConfigUseCaseDeps,
): UseCase<UpdateConfigRequest, UpdateConfigResponse> {
  return async (ctx, tx, req) => {
    const existingConfig = await tx.configs.get(req.configName);
    if (!existingConfig) {
      throw new BadRequestError('Config with this name does not exist');
    }

    if (req.schema !== null) {
      const result = validateAgainstJsonSchema(req.value, req.schema as any);
      if (!result.ok) {
        throw new BadRequestError(
          `Config value does not match schema: ${result.errors.join('; ')}`,
        );
      }
    }

    await tx.configs.put({
      ...existingConfig,
      value: req.value,
      schema: req.schema,
      description: req.description ?? existingConfig.description,
      updatedAt: deps.dateProvider.now(),
    });

    const existingConfigUsers = await tx.configUsers.getByConfigId(existingConfig.id);
    const {added, removed} = diffConfigUsers(
      existingConfigUsers.map(u => ({email: u.user_email_normalized, role: u.role})),
      req.editorEmails
        .map(email => ({email, role: 'editor' as ConfigUserRole}))
        .concat(req.ownerEmails.map(email => ({email, role: 'owner'}))),
    );

    await tx.configUsers.create(existingConfig.id, added);
    for (const user of removed) {
      await tx.configUsers.delete(existingConfig.id, user.email);
    }

    return {};
  };
}

export function diffConfigUsers(
  existingUsers: Array<{email: string; role: ConfigUserRole}>,
  newUsers: Array<{email: string; role: ConfigUserRole}>,
) {
  const existingEmails = new Set(existingUsers.map(u => u.email));
  const newEmails = new Set(newUsers.map(u => u.email));

  const added = newUsers.filter(u => !existingEmails.has(u.email));
  const removed = existingUsers.filter(u => !newEmails.has(u.email));

  return {added, removed};
}
