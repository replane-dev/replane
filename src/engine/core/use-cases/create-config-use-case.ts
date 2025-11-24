import assert from 'assert';
import {createAuditMessageId} from '../audit-message-store';
import {createConfigId, type ConfigId} from '../config-store';
import type {NewConfigUser} from '../config-user-store';
import {createConfigVersionId} from '../config-version-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {Override} from '../override-condition-schemas';
import type {TransactionalUseCase} from '../use-case';
import {normalizeEmail, validateAgainstJsonSchema} from '../utils';
import {validateOverrideReferences} from '../validate-override-references';
import type {NormalizedEmail} from '../zod';

export interface CreateConfigRequest {
  name: string;
  value: any;
  description: string;
  schema: unknown;
  overrides: unknown | null;
  currentUserEmail: NormalizedEmail;
  editorEmails: string[];
  maintainerEmails: string[];
  projectId: string;
}

export interface CreateConfigResponse {
  configId: ConfigId;
}

export interface CreateConfigUseCaseDeps {
  dateProvider: DateProvider;
}

export function createCreateConfigUseCase(
  deps: CreateConfigUseCaseDeps,
): TransactionalUseCase<CreateConfigRequest, CreateConfigResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanCreateConfig(req.projectId, req.currentUserEmail);

    // Validate no user appears with multiple roles
    // Map API names (ownerEmails/editorEmails) to database roles (maintainer/editor)
    const allMembers = [
      ...req.editorEmails.map(email => ({email, role: 'editor' as const})),
      ...req.maintainerEmails.map(email => ({email, role: 'maintainer' as const})),
    ];
    tx.configService.ensureUniqueMembers(allMembers);

    const existingConfig = await tx.configs.getByName({
      name: req.name,
      projectId: req.projectId,
    });
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

    // Validate override references use the same project ID
    validateOverrideReferences({
      overrides: req.overrides as Override[] | null,
      configProjectId: req.projectId,
    });

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const configId = createConfigId();
    await tx.configs.create({
      id: configId,
      name: req.name,
      projectId: req.projectId,
      value: req.value,
      schema: req.schema,
      overrides: req.overrides as any,
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
      overrides: req.overrides,
      value: req.value,
      version: 1,
      members: allMembers.map(m => ({normalizedEmail: normalizeEmail(m.email), role: m.role})),
      authorId: currentUser.id,
      proposalId: null,
    });

    await tx.configUsers.create(
      req.editorEmails
        .map(
          (email): NewConfigUser => ({
            email,
            role: 'editor',
            configId,
            createdAt: deps.dateProvider.now(),
            updatedAt: deps.dateProvider.now(),
          }),
        )
        .concat(
          req.maintainerEmails.map(
            (email): NewConfigUser => ({
              email,
              role: 'maintainer', // owners map to maintainer role in database
              configId,
              createdAt: deps.dateProvider.now(),
              updatedAt: deps.dateProvider.now(),
            }),
          ),
        ),
    );

    const fullConfig = await tx.configs.getById(configId);

    assert(fullConfig, 'Just created config not found');

    await tx.auditMessages.create({
      id: createAuditMessageId(),
      createdAt: deps.dateProvider.now(),
      projectId: fullConfig.projectId,
      userId: currentUser.id,
      configId: fullConfig.id,
      payload: {
        type: 'config_created',
        config: {
          id: fullConfig.id,
          projectId: fullConfig.projectId,
          name: fullConfig.name,
          value: fullConfig.value,
          schema: fullConfig.schema,
          overrides: fullConfig.overrides,
          description: fullConfig.description,
          creatorId: fullConfig.creatorId,
          createdAt: fullConfig.createdAt,
          updatedAt: fullConfig.updatedAt,
          version: fullConfig.version,
        },
      },
    });

    return {
      configId,
    };
  };
}
