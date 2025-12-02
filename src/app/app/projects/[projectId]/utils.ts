import {useProjects} from '@/contexts/project-context';
import {isValidUuid} from '@/engine/core/utils';
import {notFound, redirect, useParams} from 'next/navigation';
import {useMemo} from 'react';

export function useProjectId() {
  const {projectId} = useParams<{projectId: string}>();
  if (!projectId) {
    throw new Error('Project ID is required in the route parameters.');
  }

  // Validate that projectId is a valid UUID
  if (!isValidUuid(projectId)) {
    notFound();
  }

  return projectId;
}

export function useProject() {
  const projectId = useProjectId();
  const {projects} = useProjects();
  const project = useMemo(() => projects.find(p => p.id === projectId), [projects, projectId]);
  if (!project) {
    // redirect to /app

    redirect('/app');
  }
  return project;
}

export function useWorkspace() {
  const project = useProject();
  const {workspaces} = useProjects();
  const workspace = useMemo(
    () => workspaces.find(w => w.id === project.workspaceId),
    [workspaces, project.workspaceId],
  );
  if (!workspace) {
    throw new Error(`Workspace with ID ${project.workspaceId} not found.`);
  }
  return workspace;
}
