'use client';

import {AuditLogTable, type FilterState} from '@/components/audit-log-table';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useRouter, useSearchParams} from 'next/navigation';
import * as React from 'react';
import {Fragment} from 'react';
import {useProjectId} from '../utils';

export default function AuditLogPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initial: FilterState = React.useMemo(
    () => ({
      authorEmails: searchParams.get('authors') ?? '',
      configNames: searchParams.get('configs') ?? '',
      from: searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined,
      to: searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined,
    }),
    [searchParams],
  );

  const [filters, setFilters] = React.useState<FilterState>(initial);

  const projectId = useProjectId();

  // Push updated query params when filters change
  const updateQueryString = React.useCallback(
    (f: FilterState) => {
      const params = new URLSearchParams();
      if (f.authorEmails) params.set('authors', f.authorEmails);
      if (f.configNames) params.set('configs', f.configNames);
      if (f.from) params.set('from', f.from.toISOString().slice(0, 10));
      if (f.to) params.set('to', f.to.toISOString().slice(0, 10));
      const qs = params.toString();
      router.replace(`/app/projects/${projectId}/audit-log${qs ? `?${qs}` : ''}`);
    },
    [router, projectId],
  );

  const handleFiltersChange = React.useCallback(
    (f: FilterState) => {
      setFilters(f);
      updateQueryString(f);
    },
    [updateQueryString],
  );

  return (
    <Fragment>
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Audit Log</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <AuditLogTable
          filters={filters}
          onFiltersChange={handleFiltersChange}
          projectId={projectId}
        />
      </div>
    </Fragment>
  );
}
