import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';

export interface UpdateProjectEnvironmentsOrderRequest {
  projectId: string;
  environmentOrders: Array<{environmentId: string; order: number}>;
  identity: Identity;
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
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    await tx.permissionService.ensureCanManageProjectEnvironments(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const currentUser = await tx.users.getByEmail(currentUserEmail);
    assert(currentUser, 'Current user not found');

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
