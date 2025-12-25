import type {
  ConfigDetails,
  ConfigVariantWithEnvironmentName,
  PendingConfigProposalSummary,
} from '../config-query-service';
import type {Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';

export type {ConfigDetails, ConfigVariantWithEnvironmentName, PendingConfigProposalSummary};

export interface GetConfigRequest {
  name: string;
  identity: Identity;
  projectId: string;
}

export interface GetConfigResponse {
  config: ConfigDetails | undefined;
}

export interface GetConfigUseCasesDeps {}

export function createGetConfigUseCase({}: GetConfigUseCasesDeps): TransactionalUseCase<
  GetConfigRequest,
  GetConfigResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanReadConfigs(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const config = await tx.configQueryService.getConfigDetails(ctx, {
      name: req.name,
      projectId: req.projectId,
      identity: req.identity,
    });

    return {config};
  };
}
