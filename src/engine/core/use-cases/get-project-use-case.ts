import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetProjectRequest {
  id: string;
  currentUserEmail: NormalizedEmail;
}

export interface GetProjectResponse {
  project: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
    myRole: 'admin' | 'maintainer' | null;
  } | null;
}

export function createGetProjectUseCase(): TransactionalUseCase<
  GetProjectRequest,
  GetProjectResponse
> {
  return async (_ctx, tx, req) => {
    const project = await tx.projects.getById({
      id: req.id,
      currentUserEmail: req.currentUserEmail,
    });
    if (!project) return {project: null};
    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        myRole: project.myRole ?? null,
      },
    };
  };
}
