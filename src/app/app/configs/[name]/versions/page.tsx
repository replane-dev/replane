'use client';

import {ConfigVersionsTable} from '@/components/config-versions-table';
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
import {useSuspenseQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';
import {Fragment} from 'react';

export default function ConfigVersionsPage() {
  const {name: rawName} = useParams<{name: string}>();
  const router = useRouter();
  const name = decodeURIComponent(rawName ?? '');
  const trpc = useTRPC();
  const {data} = useSuspenseQuery(trpc.getConfigVersionList.queryOptions({name}));
  const versions = data.versions;

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
                  <Link href="/app/configs">Configs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link href={`/app/configs/${encodeURIComponent(name)}`}>{name}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Versions</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {!versions && <div>Config "{name}" not found.</div>}
        {versions && versions.length === 0 && <div>No versions yet.</div>}
        {versions && versions.length > 0 && <ConfigVersionsTable name={name} />}
      </div>
    </Fragment>
  );
}
