'use client';

import {useProjectId} from './utils';
import {redirect} from 'next/navigation';

export default function ProjectRootPage() {
  const projectId = useProjectId();
  redirect(`/app/projects/${projectId}/configs`);
}

