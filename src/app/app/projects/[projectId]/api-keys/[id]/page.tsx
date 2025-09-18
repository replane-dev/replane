'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';
import {Fragment, useState} from 'react';
import {toast} from 'sonner';
import {useProjectId} from '../../utils';

export default function ApiKeyDetailPage() {
  const params = useParams<{id: string}>();
  const id = params.id;
  const trpc = useTRPC();
  const router = useRouter();
  const projectId = useProjectId();
  const {data} = useSuspenseQuery(trpc.getApiKey.queryOptions({id, projectId}));
  const deleteMutation = useMutation(trpc.deleteApiKey.mutationOptions());
  const apiKey = data.apiKey;
  const [confirming, setConfirming] = useState(false);

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
                  <Link href={`/app/projects/${projectId}/api-keys`}>API Keys</Link>
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
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0 max-w-2xl">
        {!apiKey && (
          <Card>
            <CardContent className="p-6 text-muted-foreground">API key not found.</CardContent>
          </Card>
        )}
        {apiKey && (
          <Card>
            <CardHeader>
              <CardTitle>{apiKey.name || 'Untitled Key'}</CardTitle>
              <CardDescription>
                Created {new Date(apiKey.createdAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4">
                <div>
                  <h2 className="text-sm font-medium mb-1">Description</h2>
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {apiKey.description || '—'}
                  </p>
                </div>
                <div>
                  <h2 className="text-sm font-medium mb-1">Creator</h2>
                  <p className="text-sm">{apiKey.creatorEmail || '—'}</p>
                </div>
                <div>
                  <h2 className="text-sm font-medium mb-1">ID</h2>
                  <p className="text-sm font-mono break-all">{apiKey.id}</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col items-start gap-4">
              {!confirming && (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="inline-flex items-center rounded border border-destructive text-destructive px-4 py-2 text-sm hover:bg-destructive/10"
                >
                  Delete API Key
                </button>
              )}
              {confirming && (
                <div className="space-y-3 w-full">
                  <p className="text-sm font-medium text-foreground">
                    This action{' '}
                    <span className="font-semibold text-destructive">cannot be undone</span>. Are
                    you sure?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={async () => {
                        try {
                          await deleteMutation.mutateAsync({id});
                          toast.success('API key deleted');
                          router.push(`/app/projects/${projectId}/api-keys`);
                        } catch (e) {
                          toast.error('Failed to delete');
                        }
                      }}
                      className="inline-flex items-center rounded bg-destructive text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:text-white"
                    >
                      {deleteMutation.isPending ? 'Deleting…' : 'Confirm Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="inline-flex items-center rounded border px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </CardFooter>
          </Card>
        )}
      </div>
    </Fragment>
  );
}
