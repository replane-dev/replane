'use client';

import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {toast} from 'sonner';

export default function AppPage() {
  const trpc = useTRPC();
  // use app layout data, because it guarantees at least one project
  const appLayoutDataQuery = trpc.getAppLayoutData.queryOptions();
  const {
    data: {projects},
  } = useSuspenseQuery({...appLayoutDataQuery});
  const router = useRouter();

  React.useEffect(() => {
    if (projects.length === 0) {
      // should not happen, backend guarantees at least one project
      // show error

      toast.error('Something went wrong (no projects found), please contact support');
      return;
    }

    const projectId = projects[0]!.id;

    router.replace(`/app/projects/${projectId}/configs`);
  }, [projects, router]);

  return null;
}
