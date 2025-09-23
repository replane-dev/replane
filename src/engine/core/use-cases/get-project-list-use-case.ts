import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetProjectListRequest {
  currentUserEmail: NormalizedEmail;
}

export interface GetProjectListResponse {
  projects: Array<{
    id: string;
    name: string;
    descriptionPreview: string;
    createdAt: Date;
    updatedAt: Date;
    myRole?: 'owner' | 'admin';
  }>;
}

export function createGetProjectListUseCase(): TransactionalUseCase<
  GetProjectListRequest,
  GetProjectListResponse
> {
  return async (_ctx, tx, req) => {
    const list = await tx.projects.getAll({currentUserEmail: req.currentUserEmail});
    return {
      projects: list.map(p => ({
        id: p.id,
        name: p.name,
        descriptionPreview: p.descriptionPreview,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        myRole: p.myRole,
      })),
    };
  };
}
