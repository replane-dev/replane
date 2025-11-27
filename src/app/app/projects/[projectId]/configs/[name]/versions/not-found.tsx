'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {Button} from '@/components/ui/button';
import {FileCog, GitCommitVertical, Search} from 'lucide-react';
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';

export default function ConfigVersionNotFound() {
  const router = useRouter();
  const params = useParams();
  const projectId = useProjectId();

  // Try to extract the config name and version from URL params
  const configName = params.name ? decodeURIComponent(params.name as string) : null;
  const version = params.version as string | undefined;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <GitCommitVertical className="h-20 w-20 text-muted-foreground/20" strokeWidth={1.5} />
            <Search className="h-8 w-8 text-muted-foreground/40 absolute -bottom-1 -right-1" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Version Not Found</h1>
          {version && (
            <p className="text-sm text-muted-foreground/80 font-mono bg-muted/50 px-3 py-1.5 rounded-md inline-block">
              v{version}
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            The config version you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
        </div>

        {configName ? (
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium">What would you like to do?</p>
            <div className="flex flex-col gap-2">
              <Button asChild variant="default" className="w-full">
                <Link href={`/app/projects/${projectId}/configs/${encodeURIComponent(configName)}`}>
                  <FileCog className="mr-2 h-4 w-4" />
                  View Current Config
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link
                  href={`/app/projects/${projectId}/configs/${encodeURIComponent(configName)}/versions`}
                >
                  <GitCommitVertical className="mr-2 h-4 w-4" />
                  View All Versions
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
            Version history shows all changes made to a config.{' '}
            <Link
              href="https://replane.dev/docs/guides/version-history"
              target="_blank"
              className="text-primary hover:underline"
            >
              Learn more
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

