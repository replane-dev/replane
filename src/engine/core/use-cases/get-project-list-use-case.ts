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
    workspaceId: string;
    requireProposals: boolean;
    allowSelfApprovals: boolean;
    myRole?: 'admin' | 'maintainer';
    isExample: boolean;
  }>;
}

export function createGetProjectListUseCase(): TransactionalUseCase<
  GetProjectListRequest,
  GetProjectListResponse
> {
  return async (_ctx, tx, req) => {
    const list = await tx.projects.getUserProjects({currentUserEmail: req.currentUserEmail});
    return {
      projects: list.map(p => ({
        id: p.id,
        name: p.name,
        descriptionPreview: p.descriptionPreview,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        workspaceId: p.workspaceId,
        requireProposals: p.requireProposals,
        allowSelfApprovals: p.allowSelfApprovals,
        myRole: p.myRole,
        isExample: p.isExample,
      })),
    };
  };
}
