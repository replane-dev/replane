import type {
  ConfigDetails,
  ConfigVariantWithEnvironmentName,
  PendingConfigProposalSummary,
} from '../config-query-service';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export type {ConfigDetails, ConfigVariantWithEnvironmentName, PendingConfigProposalSummary};

export interface GetConfigRequest {
  name: string;
  currentUserEmail: NormalizedEmail;
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
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    const config = await tx.configQueryService.getConfigDetails({
      name: req.name,
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    return {config};
  };
}
