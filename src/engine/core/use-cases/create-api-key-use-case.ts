import argon2 from 'argon2';
import crypto from 'node:crypto';
import type {UseCase} from '../use-case';
import {createUuidV7} from '../uuid';
import type {NormalizedEmail} from '../zod';

export interface CreateApiKeyRequest {
  currentUserEmail: NormalizedEmail;
  name: string;
  description: string;
}

export interface CreateApiKeyResponse {
  apiKey: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    token: string; // full token shown once
  };
}

async function hashToken(token: string) {
  return argon2.hash(token, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });
}

export function createCreateApiKeyUseCase(): UseCase<CreateApiKeyRequest, CreateApiKeyResponse> {
  return async (_ctx, tx, req) => {
    const user = await tx.users.getByEmail(req.currentUserEmail);
    if (!user) {
      throw new Error('User not found');
    }

    const rawToken = `cm_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = await hashToken(rawToken);
    const now = new Date();
    const id = createUuidV7();

    await tx.apiTokens.create({
      id,
      creatorId: user.id,
      createdAt: now,
      tokenHash,
      name: req.name,
      description: req.description,
    });

    return {
      apiKey: {
        id,
        name: req.name,
        description: req.description,
        createdAt: now,
        token: rawToken,
      },
    };
  };
}
