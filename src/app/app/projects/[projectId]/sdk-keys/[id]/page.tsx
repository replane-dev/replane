'use client';

import {ApiKeyExplainer} from '@/components/api-key-explainer';
import {ApiKeySdkGuide} from '@/components/api-key-sdk-guide';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {Button} from '@/components/ui/button';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {isValidUuid} from '@/engine/core/utils';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {format, formatDistanceToNow} from 'date-fns';
import {AlignLeft, CalendarDays, FileKey, Globe, Mail, Trash2} from 'lucide-react';
import Link from 'next/link';
import {notFound, useParams, useRouter} from 'next/navigation';
import {Fragment, useState} from 'react';
import {toast} from 'sonner';
import {useProjectId} from '../../utils';

export default function SdkKeyDetailPage() {
  const params = useParams<{id: string}>();
  const id = params.id;

  // Validate UUID format before making any requests
  if (!isValidUuid(id)) {
    notFound();
  }

  const trpc = useTRPC();
  const router = useRouter();
  const projectId = useProjectId();
  const {data} = useSuspenseQuery(trpc.getApiKey.queryOptions({id, projectId}));
  const deleteMutation = useMutation(trpc.deleteApiKey.mutationOptions());
  const apiKey = data.apiKey;
  const [confirming, setConfirming] = useState(false);

  // Trigger 404 page if SDK key doesn't exist
  if (!apiKey) {
    notFound();
  }

  return (
    <Fragment>
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link href={`/app/projects/${projectId}/sdk-keys`}>SDK Keys</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Detail</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-3xl space-y-6">
          <ApiKeyExplainer />

          {/* SDK Key Details */}
          <div className="rounded-lg border bg-card/50 p-4">
            <div className="space-y-4">
              {/* Name and Created At */}
              <div>
                <h1 className="text-xl font-semibold text-foreground mb-1">
                  {apiKey.name || 'Untitled Key'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Created {formatDistanceToNow(new Date(apiKey.createdAt), {addSuffix: true})}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Environment */}
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Environment</div>
                    <div className="text-sm font-medium">{apiKey.environmentName}</div>
                  </div>
                </div>

                {/* Created Date */}
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Created</div>
                    <div className="text-sm font-medium">
                      {format(new Date(apiKey.createdAt), 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>

                {/* Creator */}
                {apiKey.creatorEmail && (
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5">Creator</div>
                      <div className="text-sm font-medium break-all">{apiKey.creatorEmail}</div>
                    </div>
                  </div>
                )}

                {/* Key ID */}
                <div className="flex items-center gap-2.5 sm:col-span-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                    <FileKey className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Key ID</div>
                    <div className="text-sm font-mono font-medium break-all">{apiKey.id}</div>
                  </div>
                </div>

                {/* Description */}
                {apiKey.description && (
                  <div className="flex items-start gap-2.5 sm:col-span-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0 mt-0.5">
                      <AlignLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5">Description</div>
                      <p className="text-sm font-medium whitespace-pre-wrap break-words">
                        {apiKey.description}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Delete Section */}
          <div className="rounded-lg border border-red-200/50 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/20 p-4">
            <div className="flex items-start gap-3">
              <Trash2 className="size-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground mb-2">Danger zone</div>
                {!confirming ? (
                  <>
                    <p className="text-sm text-foreground/80 dark:text-foreground/70 mb-3">
                      Once you delete an SDK key, all applications using it will immediately lose
                      access. This action cannot be undone.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setConfirming(true)}
                      className="text-destructive hover:text-destructive"
                    >
                      Delete SDK Key
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-foreground/80 dark:text-foreground/70">
                      This action{' '}
                      <span className="font-semibold text-destructive">cannot be undone</span>. Are
                      you sure?
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        disabled={deleteMutation.isPending}
                        onClick={async () => {
                          try {
                            await deleteMutation.mutateAsync({id, projectId});
                            toast.success('SDK key deleted');
                            router.push(`/app/projects/${projectId}/sdk-keys`);
                          } catch (e) {
                            console.error(e);
                            toast.error('Failed to delete');
                          }
                        }}
                      >
                        {deleteMutation.isPending ? 'Deleting…' : 'Confirm Delete'}
                      </Button>
                      <Button variant="outline" onClick={() => setConfirming(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SDK Integration Guide */}
          <ApiKeySdkGuide apiKey={null} />
        </div>
      </div>
    </Fragment>
  );
}

