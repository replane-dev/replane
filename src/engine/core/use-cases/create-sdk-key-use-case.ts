import {BadRequestError} from '../errors';
import type {HashingService} from '../hashing-service';
import {buildRawSdkKey} from '../sdk-key-utils';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import {createUuidV7} from '../uuid';
import type {NormalizedEmail} from '../zod';

export interface CreateSdkKeyRequest {
  currentUserEmail: NormalizedEmail;
  name: string;
  description: string;
  projectId: string;
  environmentId: string;
}

export interface CreateSdkKeyResponse {
  sdkKey: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    token: string; // full token shown once
  };
}

export function createCreateSdkKeyUseCase(deps: {
  hasher: HashingService;
}): TransactionalUseCase<CreateSdkKeyRequest, CreateSdkKeyResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanManageSdkKeys(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });
    const user = await tx.users.getByEmail(req.currentUserEmail);
    if (!user) {
      throw new Error('User not found');
    }

    const env = await tx.projectEnvironments.getById({
      environmentId: req.environmentId,
      projectId: req.projectId,
    });
    if (!env) {
      throw new BadRequestError('Environment not found');
    }

    const sdkKeyId = createUuidV7();
    // Embed apiTokenId into token for future extraction
    const sdkKey = buildRawSdkKey(sdkKeyId);
    const sdkKeyHash = await deps.hasher.hash(sdkKey);
    const now = new Date();

    await tx.sdkKeys.create(ctx, {
      id: sdkKeyId,
      createdAt: now,
      keyHash: sdkKeyHash,
      projectId: req.projectId,
      environmentId: req.environmentId,
      name: req.name,
      description: req.description,
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      userId: user.id,
      projectId: req.projectId,
      configId: null,
      payload: {
        type: 'sdk_key_created',
        sdkKey: {
          id: sdkKeyId,
          name: req.name,
          description: req.description,
          createdAt: now,
        },
      },
    });

    return {
      sdkKey: {
        id: sdkKeyId,
        name: req.name,
        description: req.description,
        createdAt: now,
        token: sdkKey,
      },
    };
  };
}
