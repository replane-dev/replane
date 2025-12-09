'use client';

import {useParams, useRouter} from 'next/navigation';
import {useEffect} from 'react';

// This page redirects to the main SDK keys page with ?new query parameter
// to open the sheet with the new SDK key form
export default function NewSdkKeyPage() {
  const {projectId} = useParams<{projectId: string}>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/app/projects/${projectId}/sdk-keys?new`);
  }, [projectId, router]);

  return null;
}
