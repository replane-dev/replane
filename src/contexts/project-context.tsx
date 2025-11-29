'use client';

import {useTRPC} from '@/trpc/client';
import {useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import React from 'react';

export interface ProjectSummary {
  id: string;
  name: string;
  organizationId: string;
  isExample: boolean;
  requireProposals: boolean;
  allowSelfApprovals: boolean;
  myRole: 'admin' | 'maintainer' | undefined;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  myRole: 'admin' | 'member' | undefined;
}

interface ProjectContextValue {
  organizations: OrganizationSummary[];
  projects: ProjectSummary[];
  // refreshes project and organization lists
  refresh: () => Promise<void>;
}

const ProjectContext = React.createContext<ProjectContextValue | undefined>(undefined);

export function ProjectProvider({children}: {children: React.ReactNode}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const projectsQuery = trpc.getProjectList.queryOptions();
  const organizationsQuery = trpc.getOrganizationList.queryOptions();
  const {data: projectsData} = useSuspenseQuery({...projectsQuery});
  const {data: organizationsData} = useSuspenseQuery({...organizationsQuery});
  const projects: ProjectSummary[] = React.useMemo(
    () =>
      projectsData.projects.map(p => ({
        id: p.id,
        name: p.name,
        organizationId: p.organizationId,
        requireProposals: p.requireProposals,
        allowSelfApprovals: p.allowSelfApprovals,
        myRole: p.myRole,
        isExample: p.isExample,
      })),
    [projectsData.projects],
  );
  const organizations: OrganizationSummary[] = React.useMemo(
    () => organizationsData.map(o => ({id: o.id, name: o.name, myRole: o.myRole})),
    [organizationsData],
  );

  // Assert non-empty list (backend guarantees at least one project)
  if (projects.length === 0) throw new Error('Expected at least one project');

  const refresh = React.useCallback(async () => {
    // Invalidate and refetch the project list immediately
    await queryClient.invalidateQueries({queryKey: projectsQuery.queryKey});
    await queryClient.refetchQueries({queryKey: projectsQuery.queryKey});
  }, [queryClient, projectsQuery.queryKey]);

  const value = React.useMemo<ProjectContextValue>(
    () => ({projects, organizations, refresh}),
    [projects, organizations, refresh],
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
