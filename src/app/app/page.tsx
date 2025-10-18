'use client';

import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import * as React from 'react';

export default function AppPage() {
  const trpc = useTRPC();
  const projectsQuery = trpc.getProjectList.queryOptions();
  const {data} = useSuspenseQuery({...projectsQuery});
  const router = useRouter();

  React.useEffect(() => {
    if (data.projects.length === 0) return; // should not happen, backend guarantees at least one project

    const projectId = data.projects.find(p => !p.isExample)?.id ?? data.projects[0]!.id;

    router.replace(`/app/projects/${projectId}/configs`);
  }, [data.projects, router]);

  return null;
}
