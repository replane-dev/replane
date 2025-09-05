import {Config} from '../config-store';
import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigRequest {
  name: string;
  currentUserEmail: NormalizedEmail;
}

export interface ConfigDetails {
  config: Config;
  editorEmails: string[];
  ownerEmails: string[];
  myRole: 'owner' | 'editor' | 'viewer';
}

export interface GetConfigResponse {
  config: ConfigDetails | undefined;
}

export interface GetConfigUseCasesDeps {}

export function createGetConfigUseCase(
  deps: GetConfigUseCasesDeps,
): UseCase<GetConfigRequest, GetConfigResponse> {
  return async (ctx, tx, req) => {
    const config = await tx.configs.getByName(req.name);
    if (!config) {
      return {config: undefined};
    }

    const configUsers = await tx.configUsers.getByConfigId(config.id);

    return {
      config: {
        config: {
          id: config.id,
          name: config.name,
          value: config.value,
          description: config.description,
          schema: config.schema,
          creatorId: config.creatorId,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          version: config.version,
        } satisfies Config,
        editorEmails: configUsers
          .filter(cu => cu.role === 'editor')
          .map(cu => cu.user_email_normalized),
        ownerEmails: configUsers
          .filter(cu => cu.role === 'owner')
          .map(cu => cu.user_email_normalized),
        myRole:
          configUsers.find(cu => cu.user_email_normalized === req.currentUserEmail)?.role ??
          'viewer',
      },
    };
  };
}
function normalizeEmail(currentUserEmail: any) {
  throw new Error('Function not implemented.');
}
