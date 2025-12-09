'use client';

import {useParams, useRouter} from 'next/navigation';
import {useEffect} from 'react';

// This page redirects to the main SDK keys page with ?key={id} query parameter
// to open the sheet with the SDK key details
export default function SdkKeyDetailPage() {
  const {projectId, id} = useParams<{projectId: string; id: string}>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/app/projects/${projectId}/sdk-keys?key=${id}`);
  }, [projectId, id, router]);

  return null;
}
