'use client';

import {useTRPC} from '@/trpc/client';
import {useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import React from 'react';

export interface ProjectSummary {
  id: string;
  name: string;
  workspaceId: string;
  isExample: boolean;
  requireProposals: boolean;
  allowSelfApprovals: boolean;
  myRole: 'admin' | 'maintainer' | undefined;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  myRole: 'admin' | 'member' | undefined;
}

interface ProjectContextValue {
  workspaces: WorkspaceSummary[];
  projects: ProjectSummary[];
  // refreshes project and workspace lists
  refresh: () => Promise<void>;
}

const ProjectContext = React.createContext<ProjectContextValue | undefined>(undefined);

export function ProjectProvider({children}: {children: React.ReactNode}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const projectsQuery = trpc.getProjectList.queryOptions();
  const workspacesQuery = trpc.getWorkspaceList.queryOptions();
  const {data: projectsData} = useSuspenseQuery({...projectsQuery});
  const {data: workspacesData} = useSuspenseQuery({...workspacesQuery});
  const projects: ProjectSummary[] = React.useMemo(
    () =>
      projectsData.projects.map(p => ({
        id: p.id,
        name: p.name,
        workspaceId: p.workspaceId,
        requireProposals: p.requireProposals,
        allowSelfApprovals: p.allowSelfApprovals,
        myRole: p.myRole,
        isExample: p.isExample,
      })),
    [projectsData.projects],
  );
  const workspaces: WorkspaceSummary[] = React.useMemo(
    () => workspacesData.map(w => ({id: w.id, name: w.name, myRole: w.myRole})),
    [workspacesData],
  );

  // Assert non-empty list (backend guarantees at least one project)
  if (projects.length === 0) throw new Error('Expected at least one project');

  const refresh = React.useCallback(async () => {
    // Invalidate and refetch the project list immediately
    await queryClient.invalidateQueries({queryKey: projectsQuery.queryKey});
    await queryClient.refetchQueries({queryKey: projectsQuery.queryKey});
  }, [queryClient, projectsQuery.queryKey]);

  const value = React.useMemo<ProjectContextValue>(
    () => ({projects, workspaces, refresh}),
    [projects, workspaces, refresh],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects(): ProjectContextValue {
  const ctx = React.useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return ctx;
}
