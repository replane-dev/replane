'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {Button} from '@/components/ui/button';
import {AlertTriangle, ArrowLeft, Settings} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';

export default function ProjectPageNotFound() {
  const router = useRouter();
  const projectId = useProjectId();

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <AlertTriangle className="h-16 w-16 text-yellow-500" strokeWidth={1.5} />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Resource Not Found</h1>
          <p className="text-muted-foreground text-sm">
            The config, SDK key, or page you&apos;re looking for doesn&apos;t exist in this project.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          <Button asChild variant="outline">
            <Link href={`/app/projects/${projectId}/configs`}>View All Configs</Link>
          </Button>
        </div>

        <div className="pt-4 flex flex-wrap gap-2 justify-center text-sm">
          <Link
            href={`/app/projects/${projectId}/configs`}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Configs
          </Link>
          <span className="text-muted-foreground">•</span>
          <Link
            href={`/app/projects/${projectId}/sdk-keys`}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            SDK Keys
          </Link>
          <span className="text-muted-foreground">•</span>
          <Link
            href={`/app/projects/${projectId}/audit-log`}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Audit Log
          </Link>
          <span className="text-muted-foreground">•</span>
          <Link
            href={`/app/projects/${projectId}/settings`}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            <Settings className="inline h-3 w-3 mr-1" />
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
