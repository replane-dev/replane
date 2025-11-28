'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {redirect} from 'next/navigation';

export default function ProjectSettingsPage() {
  const projectId = useProjectId();
  redirect(`/app/projects/${projectId}/settings/general`);
}
