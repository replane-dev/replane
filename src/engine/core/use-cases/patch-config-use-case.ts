import assert from 'assert';
import {createAuditMessageId, type AuditMessage} from '../audit-message-store';
import type {ConfigId} from '../config-store';
import {createConfigVersionId} from '../config-version-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import {diffMembers} from '../member-diff';
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

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    if (req.members || req.schema) {
      await tx.permissionService.ensureCanManageConfig(existingConfig.id, req.currentUserEmail);
    } else {
      await tx.permissionService.ensureCanEditConfig(existingConfig.id, req.currentUserEmail);
    }

    const nextValue = req.value ? req.value.newValue : existingConfig.value;
    const nextSchema = req.schema ? req.schema.newSchema : existingConfig.schema;
    if (nextSchema !== null) {
      const result = validateAgainstJsonSchema(nextValue, nextSchema);
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

    const beforeConfig = existingConfig;

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

    let membersDiff: {
      added: Array<{email: string; role: string}>;
      removed: Array<{email: string; role: string}>;
    } | null = null;
    if (req.members) {
      const existingConfigUsers = await tx.configUsers.getByConfigId(existingConfig.id);
      const {added, removed} = diffMembers(
        existingConfigUsers.map(u => ({email: u.user_email_normalized, role: u.role})),
        req.members.newMembers,
      );

      await tx.configUsers.create(
        added.map(x => ({
          configId: existingConfig.id,
          email: x.email,
          role: x.role,
          createdAt: deps.dateProvider.now(),
          updatedAt: deps.dateProvider.now(),
        })),
      );
      for (const user of removed) {
        await tx.configUsers.delete(existingConfig.id, user.email);
      }
      membersDiff = {
        added: added.map(a => ({email: a.email, role: a.role})),
        removed: removed.map(r => ({email: r.email, role: r.role})),
      };
    }

    const afterConfig = await tx.configs.getById(existingConfig.id);

    if (beforeConfig && afterConfig) {
      const baseMessage: AuditMessage = {
        id: createAuditMessageId(),
        createdAt: deps.dateProvider.now(),
        userId: currentUser.id,
        projectId: afterConfig.projectId,
        configId: afterConfig.id,
        payload: {
          type: 'config_updated',
          before: {
            id: beforeConfig.id,
            projectId: beforeConfig.projectId,
            name: beforeConfig.name,
            value: beforeConfig.value,
            schema: beforeConfig.schema,
            description: beforeConfig.description,
            creatorId: beforeConfig.creatorId,
            createdAt: beforeConfig.createdAt,
            updatedAt: beforeConfig.updatedAt,
            version: beforeConfig.version,
          },
          after: {
            id: afterConfig.id,
            projectId: afterConfig.projectId,
            name: afterConfig.name,
            value: afterConfig.value,
            schema: afterConfig.schema,
            description: afterConfig.description,
            creatorId: afterConfig.creatorId,
            createdAt: afterConfig.createdAt,
            updatedAt: afterConfig.updatedAt,
            version: afterConfig.version,
          },
        },
      };
      await tx.auditMessages.create(baseMessage);

      if (membersDiff && membersDiff.added.length + membersDiff.removed.length > 0) {
        await tx.auditMessages.create({
          id: createAuditMessageId(),
          projectId: afterConfig.projectId,
          createdAt: deps.dateProvider.now(),
          userId: currentUser.id,
          configId: afterConfig.id,
          payload: {
            type: 'config_members_changed',
            config: {
              id: afterConfig.id,
              projectId: afterConfig.projectId,
              name: afterConfig.name,
              value: afterConfig.value,
              schema: afterConfig.schema,
              description: afterConfig.description,
              creatorId: afterConfig.creatorId,
              createdAt: afterConfig.createdAt,
              updatedAt: afterConfig.updatedAt,
              version: afterConfig.version,
            },
            added: membersDiff.added,
            removed: membersDiff.removed,
          },
        });
      }
    }

    return {};
  };
}
