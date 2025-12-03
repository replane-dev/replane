import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import {createUuidV7} from '../uuid';
import type {NormalizedEmail} from '../zod';

export interface CreateProjectEnvironmentRequest {
  projectId: string;
  name: string;
  copyFromEnvironmentId: string;
  currentUserEmail: NormalizedEmail;
}

export interface CreateProjectEnvironmentResponse {
  environmentId: string;
}

export interface CreateProjectEnvironmentUseCaseDeps {
  dateProvider: DateProvider;
}

export function createCreateProjectEnvironmentUseCase(
  deps: CreateProjectEnvironmentUseCaseDeps,
): TransactionalUseCase<CreateProjectEnvironmentRequest, CreateProjectEnvironmentResponse> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Check if user has admin permission
    await tx.permissionService.ensureCanManageProjectUsers(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    // Validate environment name
    if (!/^[A-Za-z0-9_\s-]{1,50}$/i.test(req.name)) {
      throw new BadRequestError(
        'Environment name must be 1-50 characters and contain only letters, numbers, spaces, underscores, or hyphens',
      );
    }

    // Verify the source environment exists and belongs to this project
    const sourceEnvironment = await tx.projectEnvironments.getById({
      environmentId: req.copyFromEnvironmentId,
      projectId: req.projectId,
    });
    if (!sourceEnvironment) {
      throw new BadRequestError('Source environment not found');
    }
    if (sourceEnvironment.projectId !== req.projectId) {
      throw new BadRequestError('Source environment does not belong to this project');
    }

    // Check if environment with this name already exists
    const existing = await tx.projectEnvironments.getByProjectIdAndName({
      projectId: req.projectId,
      name: req.name,
    });

    if (existing) {
      throw new BadRequestError('Environment with this name already exists in this project');
    }

    const environmentId = createUuidV7();
    const now = deps.dateProvider.now();

    // Get the current max order for this project to append at the end
    const existingEnvironments = await tx.projectEnvironments.getByProjectId(req.projectId);
    const maxOrder = Math.max(0, ...existingEnvironments.map(e => e.order));

    await tx.projectEnvironments.create({
      id: environmentId,
      projectId: req.projectId,
      name: req.name,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    // Get all config variants from the source environment
    const sourceVariants = await tx.configVariants.getByEnvironmentId(req.copyFromEnvironmentId);

    // Create config variants for all configs by copying from source environment
    for (const sourceVariant of sourceVariants) {
      const configVariantId = createUuidV7();

      await tx.configVariants.create({
        id: configVariantId,
        configId: sourceVariant.configId,
        environmentId,
        value: sourceVariant.value,
        schema: sourceVariant.schema,
        overrides: sourceVariant.overrides,
        version: 1,
        createdAt: now,
        updatedAt: now,
        useDefaultSchema: sourceVariant.useDefaultSchema,
      });
    }

    // Create audit log for environment creation
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      userId: currentUser.id,
      configId: null,
      projectId: req.projectId,
      payload: {
        type: 'environment_created',
        environment: {
          id: environmentId,
          name: req.name,
          projectId: req.projectId,
          createdAt: now,
        },
      },
    });

    return {environmentId};
  };
}
