'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';
import {Fragment, useState} from 'react';
import {toast} from 'sonner';

export default function ApiKeyDetailPage() {
  const params = useParams<{id: string}>();
  const id = params.id;
  const trpc = useTRPC();
  const router = useRouter();
  const {data} = useSuspenseQuery(trpc.getApiKey.queryOptions({id}));
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
                  <Link href="/app/api-keys">API Keys</Link>
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
          <div className="rounded border p-4 text-sm text-muted-foreground">API key not found.</div>
        )}
        {apiKey && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">{apiKey.name || 'Untitled Key'}</h1>
              <p className="text-sm text-muted-foreground">
                Created {new Date(apiKey.createdAt).toLocaleString()}
              </p>
            </div>
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
            <div className="pt-4 border-t">
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
                <div className="space-y-3">
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
                          router.push('/app/api-keys');
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
            </div>
          </div>
        )}
      </div>
    </Fragment>
  );
}
