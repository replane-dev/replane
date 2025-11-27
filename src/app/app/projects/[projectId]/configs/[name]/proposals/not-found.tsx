'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {Button} from '@/components/ui/button';
import {FileCog, GitBranch, Search} from 'lucide-react';
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';

export default function ProposalNotFound() {
  const router = useRouter();
  const params = useParams();
  const projectId = useProjectId();

  // Try to extract the config name from the URL params
  const configName = params.name ? decodeURIComponent(params.name as string) : null;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <GitBranch className="h-20 w-20 text-muted-foreground/20" strokeWidth={1.5} />
            <Search className="h-8 w-8 text-muted-foreground/40 absolute -bottom-1 -right-1" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Proposal Not Found</h1>
          <p className="text-muted-foreground text-sm">
            The proposal you&apos;re looking for doesn&apos;t exist, has been approved/rejected, or
            you don&apos;t have permission to view it.
          </p>
        </div>

        {configName ? (
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium">What would you like to do?</p>
            <div className="flex flex-col gap-2">
              <Button asChild variant="default" className="w-full">
                <Link href={`/app/projects/${projectId}/configs/${encodeURIComponent(configName)}`}>
                  <FileCog className="mr-2 h-4 w-4" />
                  View Config
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link
                  href={`/app/projects/${projectId}/configs/${encodeURIComponent(configName)}/proposals`}
                >
                  <GitBranch className="mr-2 h-4 w-4" />
                  View All Proposals
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium">What would you like to do?</p>
            <div className="flex flex-col gap-2">
              <Button asChild variant="default" className="w-full">
                <Link href={`/app/projects/${projectId}/configs`}>
                  <FileCog className="mr-2 h-4 w-4" />
                  View All Configs
                </Link>
              </Button>
            </div>
          </div>
        )}

        <Button variant="ghost" onClick={() => router.back()} className="w-full">
          Go Back
        </Button>

        <div className="pt-4 text-xs text-muted-foreground">
          <p>
            The proposal may have been approved or rejected.{' '}
            <Link
              href={`/app/projects/${projectId}/audit-log`}
              className="text-primary hover:underline"
            >
              Check audit log
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
