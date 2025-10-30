'use client';

import {useTRPC} from '@/trpc/client';
import {useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import React from 'react';

export interface ProjectSummary {
  id: string;
  name: string;
  isExample: boolean;
  myRole: 'owner' | 'admin' | undefined;
}

interface ProjectContextValue {
  projects: ProjectSummary[];
  // refreshes project list
  refresh: () => Promise<void>;
}

const ProjectContext = React.createContext<ProjectContextValue | undefined>(undefined);

export function ProjectProvider({children}: {children: React.ReactNode}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const projectsQuery = trpc.getProjectList.queryOptions();
  const {data} = useSuspenseQuery({...projectsQuery});
  const projects: ProjectSummary[] = React.useMemo(
    () =>
      data.projects.map(p => ({id: p.id, name: p.name, myRole: p.myRole, isExample: p.isExample})),
    [data.projects],
  );

  // Assert non-empty list (backend guarantees at least one project)
  if (projects.length === 0) throw new Error('Expected at least one project');

  const refresh = React.useCallback(async () => {
    // Invalidate and refetch the project list immediately
    await queryClient.invalidateQueries({queryKey: projectsQuery.queryKey});
    await queryClient.refetchQueries({queryKey: projectsQuery.queryKey});
  }, [queryClient, projectsQuery.queryKey]);

  const value = React.useMemo<ProjectContextValue>(
    () => ({projects, refresh}),
    [projects, refresh],
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
