'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {Fragment} from 'react';

export default function ApiKeysPage() {
  const trpc = useTRPC();
  const {data} = useSuspenseQuery(trpc.getApiKeyList.queryOptions());
  const apiKeys = data.apiKeys;
  return (
    <Fragment>
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>API Keys</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div>
          <Link
            href="/app/api-keys/new"
            className="inline-flex items-center rounded bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            New API Key
          </Link>
        </div>
        {apiKeys.length === 0 && (
          <div className="rounded border p-4 text-sm text-muted-foreground">No API keys yet.</div>
        )}
        {apiKeys.length > 0 && (
          <div className="rounded border divide-y">
            <div className="px-4 py-2 text-xs uppercase text-muted-foreground grid grid-cols-4 gap-2">
              <span>Name</span>
              <span>Description</span>
              <span>Created</span>
              <span>Creator</span>
            </div>
            {apiKeys.map(k => (
              <Link
                key={k.id}
                href={`/app/api-keys/${k.id}`}
                className="px-4 py-2 text-sm grid grid-cols-4 gap-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
              >
                <span className="truncate font-medium underline-offset-2 group-hover:underline">
                  {k.name || '—'}
                </span>
                <span className="truncate" title={k.description}>
                  {k.description || '—'}
                </span>
                <span>{new Date(k.createdAt).toLocaleString()}</span>
                <span className="truncate" title={k.creatorEmail || ''}>
                  {k.creatorEmail || '—'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Fragment>
  );
}
