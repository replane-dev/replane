import type {ConfigId} from '../config-store';
import {createConfigVersionId} from '../config-version-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';
import {validateAgainstJsonSchema} from '../utils';
import type {ConfigMember, NormalizedEmail} from '../zod';

export interface PatchConfigRequest {
  configId: ConfigId;
  value?: {newValue: any};
  schema?: {newSchema: any};
  description?: {newDescription: string};
  currentUserEmail: NormalizedEmail;
  members?: {newMembers: ConfigMember[]};
  prevVersion: number;
}

export interface PatchConfigResponse {}

export interface PatchConfigUseCaseDeps {
  dateProvider: DateProvider;
}

export function createPatchConfigUseCase(
  deps: PatchConfigUseCaseDeps,
): UseCase<PatchConfigRequest, PatchConfigResponse> {
  return async (ctx, tx, req) => {
    const existingConfig = await tx.configs.getById(req.configId);
    if (!existingConfig) {
      throw new BadRequestError('Config with this name does not exist');
    }

    if (existingConfig.version !== req.prevVersion) {
      throw new BadRequestError(`Config was edited by another user. Please, refresh the page.`);
    }

    if (req.members || req.schema) {
      await tx.permissionService.ensureCanManageConfig(existingConfig.id, req.currentUserEmail);
    } else {
      await tx.permissionService.ensureCanEditConfig(existingConfig.id, req.currentUserEmail);
    }

    const nextValue = req.value ? req.value.newValue : existingConfig.value;
    const nextSchema = req.schema ? req.schema.newSchema : existingConfig.schema;
    if (nextSchema !== null) {
      const result = validateAgainstJsonSchema(nextValue, nextSchema as any);
      if (!result.ok) {
        throw new BadRequestError(
          `Config value does not match schema: ${result.errors.join('; ')}`,
        );
      }
    }
    const nextDescription = req.description
      ? req.description.newDescription
      : existingConfig.description;
    const nextVersion = existingConfig.version + 1;

    await tx.configs.updateById({
      id: existingConfig.id,
      value: nextValue,
      schema: nextSchema,
      description: nextDescription,
      updatedAt: deps.dateProvider.now(),
      version: nextVersion,
    });

    await tx.configVersions.create({
      configId: existingConfig.id,
      createdAt: deps.dateProvider.now(),
      description: nextDescription,
      id: createConfigVersionId(),
      name: existingConfig.name,
      schema: nextSchema,
      value: nextValue,
      version: nextVersion,
    });

    if (req.members) {
      const existingConfigUsers = await tx.configUsers.getByConfigId(existingConfig.id);
      const {added, removed} = diffConfigUsers(
        existingConfigUsers.map(u => ({email: u.user_email_normalized, role: u.role})),
        req.members.newMembers,
      );

      await tx.configUsers.create(existingConfig.id, added);
      for (const user of removed) {
        await tx.configUsers.delete(existingConfig.id, user.email);
      }
    }

    return {};
  };
}

export function diffConfigUsers(existingUsers: Array<ConfigMember>, newUsers: Array<ConfigMember>) {
  const existingEmails = new Set(existingUsers.map(u => u.email));
  const newEmails = new Set(newUsers.map(u => u.email));

  const added = newUsers.filter(u => !existingEmails.has(u.email));
  const removed = existingUsers.filter(u => !newEmails.has(u.email));

  return {added, removed};
}
