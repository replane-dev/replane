import assert from 'node:assert';
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
      authorId: (await tx.users.getByEmail(req.currentUserEmail))?.id ?? null,
    });

    if (req.members) {
      const existingConfigUsers = await tx.configUsers.getByConfigId(existingConfig.id);
      const {added, removed} = diffConfigMembers(
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

export function diffConfigMembers(
  existingMembers: Array<ConfigMember>,
  newMembers: Array<ConfigMember>,
) {
  // email can contain only one @, so we use it twice for a separator
  const SEPARATOR = '@@';

  assert(existingMembers.every(x => !x.email.includes(SEPARATOR) && !x.role.includes(SEPARATOR)));
  assert(newMembers.every(x => !x.email.includes(SEPARATOR) && !x.role.includes(SEPARATOR)));

  const toMemberId = (member: ConfigMember) => `${member.role}${SEPARATOR}${member.email}`;

  const existingEmails = new Set(existingMembers.map(toMemberId));
  const newEmails = new Set(newMembers.map(toMemberId));

  const added = newMembers.filter(u => !existingEmails.has(toMemberId(u)));
  const removed = existingMembers.filter(u => !newEmails.has(toMemberId(u)));

  return {added, removed};
}
