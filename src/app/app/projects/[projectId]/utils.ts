import {useProjects} from '@/contexts/project-context';
import {isValidUuid} from '@/engine/core/utils';
import {notFound, useParams} from 'next/navigation';
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
    throw new Error(`Project with ID ${projectId} not found.`);
  }
  return project;
}
