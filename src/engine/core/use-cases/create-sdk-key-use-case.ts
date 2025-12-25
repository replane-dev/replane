import {BadRequestError} from '../errors';
import {getUserIdFromIdentity, type Identity} from '../identity';
import {buildRawSdkKey, getSdkKeyPrefix, getSdkKeySuffix} from '../sdk-key-utils';
import type {SecureHashingService} from '../secure-hashing-service';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import {createUuidV7} from '../uuid';

export interface CreateSdkKeyRequest {
  identity: Identity;
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
  secureHasher: SecureHashingService;
}): TransactionalUseCase<CreateSdkKeyRequest, CreateSdkKeyResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanManageSdkKeys(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

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
    const sdkKeyHash = await deps.secureHasher.hash(sdkKey);
    const keyPrefix = getSdkKeyPrefix(sdkKey);
    const keySuffix = getSdkKeySuffix(sdkKey);
    const now = new Date();

    await tx.sdkKeys.create(ctx, {
      id: sdkKeyId,
      createdAt: now,
      keyHash: sdkKeyHash,
      keyPrefix,
      keySuffix,
      projectId: req.projectId,
      environmentId: req.environmentId,
      name: req.name,
      description: req.description,
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      userId: getUserIdFromIdentity(req.identity),
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
