'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {Button} from '@/components/ui/button';
import {Key, Plus, Search} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';

export default function ApiKeyNotFound() {
  const router = useRouter();
  const projectId = useProjectId();

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <Key className="h-20 w-20 text-muted-foreground/20" strokeWidth={1.5} />
            <Search className="h-8 w-8 text-muted-foreground/40 absolute -bottom-1 -right-1" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">API Key Not Found</h1>
          <p className="text-muted-foreground text-sm">
            The API key you&apos;re looking for doesn&apos;t exist, has been deleted, or you
            don&apos;t have permission to access it.
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium">What would you like to do?</p>
          <div className="flex flex-col gap-2">
            <Button asChild variant="default" className="w-full">
              <Link href={`/app/projects/${projectId}/api-keys/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Create New API Key
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/app/projects/${projectId}/api-keys`}>
                <Key className="mr-2 h-4 w-4" />
                View All API Keys
              </Link>
            </Button>
          </div>
        </div>

        <Button variant="ghost" onClick={() => router.back()} className="w-full">
          Go Back
        </Button>

        <div className="pt-4 text-xs text-muted-foreground">
          <p>
            Need help?{' '}
            <Link
              href="https://replane.dev/docs/guides/api-keys"
              target="_blank"
              className="text-primary hover:underline"
            >
              View documentation
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
