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
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {Fragment} from 'react';

export default function ConfigVersionsPage() {
  const {name: rawName} = useParams<{name: string}>();
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
        {versions && versions.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Author</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map(v => (
                <TableRow key={v.id}>
                  <TableCell>{v.version}</TableCell>
                  <TableCell>{new Date(v.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="max-w-[400px] truncate" title={v.description}>
                    {v.description}
                  </TableCell>
                  <TableCell>{v.authorEmail ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Fragment>
  );
}
