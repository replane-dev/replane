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

export function useOrganization() {
  const project = useProject();
  const {organizations} = useProjects();
  const organization = useMemo(
    () => organizations.find(o => o.id === project.organizationId),
    [organizations, project.organizationId],
  );
  if (!organization) {
    throw new Error(`Organization with ID ${project.organizationId} not found.`);
  }
  return organization;
}
