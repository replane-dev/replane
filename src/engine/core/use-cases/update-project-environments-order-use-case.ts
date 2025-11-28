import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface UpdateProjectEnvironmentsOrderRequest {
  projectId: string;
  environmentOrders: Array<{environmentId: string; order: number}>;
  currentUserEmail: NormalizedEmail;
}

export interface UpdateProjectEnvironmentsOrderResponse {}

export interface UpdateProjectEnvironmentsOrderUseCaseDeps {
  dateProvider: DateProvider;
}

export function createUpdateProjectEnvironmentsOrderUseCase(
  deps: UpdateProjectEnvironmentsOrderUseCaseDeps,
): TransactionalUseCase<
  UpdateProjectEnvironmentsOrderRequest,
  UpdateProjectEnvironmentsOrderResponse
> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Check if user has admin permission
    await tx.permissionService.ensureCanManageProjectUsers(req.projectId, req.currentUserEmail);

    // Verify all environments belong to this project
    const allEnvironments = await tx.projectEnvironments.getByProjectId(req.projectId);
    const environmentIds = new Set(allEnvironments.map(e => e.id));

    for (const {environmentId} of req.environmentOrders) {
      if (!environmentIds.has(environmentId)) {
        throw new BadRequestError('Environment does not belong to this project');
      }
    }

    // Update each environment's order
    const now = deps.dateProvider.now();
    for (const {environmentId, order} of req.environmentOrders) {
      await tx.projectEnvironments.update({
        id: environmentId,
        order,
        updatedAt: now,
      });
    }

    return {};
  };
}

