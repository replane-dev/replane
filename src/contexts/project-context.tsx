'use client';

import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import React from 'react';

export interface ProjectSummary {
  id: string;
  name: string;
  myRole: 'owner' | 'admin' | undefined;
}

interface ProjectContextValue {
  projects: ProjectSummary[];
}

const ProjectContext = React.createContext<ProjectContextValue | undefined>(undefined);

export function ProjectProvider({children}: {children: React.ReactNode}) {
  const trpc = useTRPC();
  const projectsQuery = trpc.getProjectList.queryOptions();
  const {data} = useSuspenseQuery({...projectsQuery});
  const projects: ProjectSummary[] = React.useMemo(
    () => data.projects.map(p => ({id: p.id, name: p.name, myRole: p.myRole})),
    [data.projects],
  );

  // Assert non-empty list (backend guarantees at least one project)
  if (projects.length === 0) throw new Error('Expected at least one project');

  const value = React.useMemo<ProjectContextValue>(() => ({projects}), [projects]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects(): ProjectContextValue {
  const ctx = React.useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProjectSelection must be used within a ProjectProvider');
  }
  return ctx;
}
