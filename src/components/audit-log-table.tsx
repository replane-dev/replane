'use client';

import {Button} from '@/components/ui/button';
import {Calendar} from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Input} from '@/components/ui/input';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import type {AuditLogPayload} from '@/engine/core/audit-log-store';
import {assertNever} from '@/engine/core/utils';
import {shouldNavigateOnRowClick} from '@/lib/table-row-interaction';
import {cn} from '@/lib/utils';
import {useTRPC} from '@/trpc/client';
import {useInfiniteQuery} from '@tanstack/react-query';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {format} from 'date-fns';
import {ArrowUpDown, ChevronDown, Loader2, MoreHorizontal} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import * as React from 'react';

export interface FilterState {
  authorEmails: string;
  configNames: string;
  from?: Date;
  to?: Date;
}

function humanizePayload(payload: AuditLogPayload): {action: string; details: string} {
  if (!payload || typeof payload !== 'object') return {action: 'unknown', details: ''};
  if (payload.type === 'config_created') {
    return {action: 'Config Created', details: `Config name '${payload.config.name}'`};
  } else if (payload.type === 'config_updated') {
    return {action: 'Config Updated', details: `Config name '${payload.after.name}'`};
  } else if (payload.type === 'config_deleted') {
    return {action: 'Config Deleted', details: `Config name '${payload.config.name}'`};
  } else if (payload.type === 'config_version_restored') {
    return {
      action: 'Config Version Restored',
      details: `Config name '${payload.after.name}' -> v${payload.restoredFromVersion}`,
    };
  } else if (payload.type === 'api_key_created') {
    return {action: 'SDK Key Created', details: `SDK Key name '${payload.apiKey.name}'`};
  } else if (payload.type === 'api_key_deleted') {
    return {action: 'SDK Key Deleted', details: `SDK Key name '${payload.apiKey.name}'`};
  } else if (payload.type === 'config_members_changed') {
    return {action: 'Config Members Changed', details: `Config name '${payload.config.name}'`};
  } else if (payload.type === 'project_created') {
    return {action: 'Project Created', details: `Project name '${payload.project.name}'`};
  } else if (payload.type === 'project_updated') {
    return {
      action: 'Project Updated',
      details: `Name '${payload.before.name}' → '${payload.after.name}'`,
    };
  } else if (payload.type === 'project_members_changed') {
    const added = payload.added?.length ?? 0;
    const removed = payload.removed?.length ?? 0;
    const parts: string[] = [];
    if (added) parts.push(`+${added}`);
    if (removed) parts.push(`-${removed}`);
    return {action: 'Project Members Changed', details: parts.join(' ') || 'No changes'};
  } else if (payload.type === 'project_deleted') {
    return {action: 'Project Deleted', details: `Project name '${payload.project.name}'`};
  } else if (payload.type === 'config_proposal_approved') {
    return {
      action: 'Config Proposal Approved',
      details: `Proposal ID '${payload.proposalId}'`,
    };
  } else if (payload.type === 'config_proposal_rejected') {
    return {
      action: 'Config Proposal Rejected',
      details: `Proposal ID '${payload.proposalId}'`,
    };
  } else if (payload.type === 'config_proposal_created') {
    return {
      action: 'Config Proposal Created',
      details: `Proposal ID '${payload.proposalId}'`,
    };
  } else if (payload.type === 'config_variant_updated') {
    return {
      action: 'Config Variant Updated',
      details: `${payload.after.configName} (${payload.after.environmentName}) v${payload.before.version} → v${payload.after.version}`,
    };
  } else if (payload.type === 'environment_created') {
    return {
      action: 'Environment Created',
      details: `Environment '${payload.environment.name}'`,
    };
  } else if (payload.type === 'environment_deleted') {
    return {
      action: 'Environment Deleted',
      details: `Environment '${payload.environment.name}'`,
    };
  } else if (payload.type === 'config_variant_version_restored') {
    return {
      action: 'Config Variant Version Restored',
      details: `Config '${payload.after.configId}' v${payload.restoredFromVersion} → v${payload.after.version}`,
    };
  } else if (payload.type === 'config_variant_proposal_created') {
    return {
      action: 'Config Variant Proposal Created',
      details: `Proposal for variant`,
    };
  } else if (payload.type === 'config_variant_proposal_approved') {
    return {
      action: 'Config Variant Proposal Approved',
      details: `Variant proposal approved`,
    };
  } else if (payload.type === 'config_variant_proposal_rejected') {
    return {
      action: 'Config Variant Proposal Rejected',
      details: `Variant proposal rejected`,
    };
  } else {
    assertNever(payload, `Unhandled payload type: ${JSON.stringify(payload)}`);
  }
}

interface AuditLogRow {
  id: string;
  createdAt: Date;
  userEmail: string | null;
  configName: string | null;
  action: string;
  details: string;
  rawPayload: any; // reserved for potential future expansion (popover etc.)
}

export function AuditLogTable({
  filters,
  onFiltersChange,
  projectId,
}: {
  filters: FilterState;
  projectId: string;
  onFiltersChange: (f: FilterState) => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  // Local input state for debouncing textual filters
  const [authorEmailsInput, setAuthorEmailsInput] = React.useState(filters.authorEmails);
  const [configNamesInput, setConfigNamesInput] = React.useState(filters.configNames);
  const [openFrom, setOpenFrom] = React.useState(false);
  const [openTo, setOpenTo] = React.useState(false);

  // Debounce textual filter changes so we don't refetch on every keystroke
  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (authorEmailsInput !== filters.authorEmails || configNamesInput !== filters.configNames) {
        onFiltersChange({
          ...filters,
          authorEmails: authorEmailsInput,
          configNames: configNamesInput,
        });
      }
    }, 400); // 400ms debounce window
    return () => clearTimeout(handle);
  }, [authorEmailsInput, configNamesInput, filters, onFiltersChange]);

  // Sync local inputs when external filters change (e.g., via URL updates)
  React.useEffect(() => {
    setAuthorEmailsInput(filters.authorEmails);
  }, [filters.authorEmails]);
  React.useEffect(() => {
    setConfigNamesInput(filters.configNames);
  }, [filters.configNames]);

  const authors = React.useMemo(
    () =>
      filters.authorEmails
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    [filters.authorEmails],
  );
  const configs = React.useMemo(
    () =>
      filters.configNames
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    [filters.configNames],
  );

  const baseInput = {
    from: filters.from,
    to: filters.to,
    authorEmails: authors.length ? authors : undefined,
    configNames: configs.length ? configs : undefined,
    limit: 50,
  } as const;
  type PageResult = {
    messages: Array<{
      id: string;
      createdAt: string | Date;
      userEmail: string | null;
      configName: string | null;
      payload: any;
    }>;
    nextCursor: {createdAt: string; id: string} | null;
  };
  const query = useInfiniteQuery<PageResult>({
    queryKey: ['audit-log', baseInput],
    initialPageParam: undefined as {createdAt: Date; id: string} | undefined,
    queryFn: async ({pageParam}) => {
      const cursor = pageParam as {createdAt: Date; id: string} | undefined;
      const opts = trpc.getAuditLog.queryOptions({
        ...baseInput,
        projectId,
        cursor: cursor ?? undefined,
      });
      const result: PageResult = await (opts.queryFn as any)({
        queryKey: opts.queryKey,
        signal: undefined,
      });
      return result;
    },
    getNextPageParam: (lastPage: PageResult) => lastPage.nextCursor ?? undefined,
  });

  const messages: PageResult['messages'] = React.useMemo(
    () => (query.data?.pages as PageResult[] | undefined)?.flatMap(p => p.messages) ?? [],
    [query.data],
  );

  // transform into table rows (derive action/details once)
  const data: AuditLogRow[] = React.useMemo(() => {
    return messages.map(m => {
      const {action, details} = humanizePayload(m.payload);
      return {
        id: m.id,
        createdAt: new Date(m.createdAt),
        userEmail: m.userEmail,
        configName: m.configName,
        action,
        details,
        rawPayload: m.payload,
      } satisfies AuditLogRow;
    });
  }, [messages]);

  const [sorting, setSorting] = React.useState<SortingState>([{id: 'createdAt', desc: true}]);

  const columns = React.useMemo<ColumnDef<AuditLogRow>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: ({column}) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 font-medium"
          >
            Time <ArrowUpDown className="ml-1 h-4 w-4" />
          </Button>
        ),
        sortingFn: (a, b) => a.original.createdAt.getTime() - b.original.createdAt.getTime(),
        cell: ({row}) => (
          <time dateTime={row.original.createdAt.toISOString()} className="whitespace-nowrap">
            {format(row.original.createdAt, 'yyyy-MM-dd HH:mm:ss')}
          </time>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({row}) => row.original.action,
      },
      {
        accessorKey: 'details',
        header: 'Details',
        cell: ({row}) => (
          <div title={row.original.details} className="max-w-[400px] truncate">
            {row.original.details}
          </div>
        ),
      },
      {
        accessorKey: 'userEmail',
        header: 'Author',
        cell: ({row}) => row.original.userEmail ?? '—',
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({row}) => {
          const r = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                >
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/app/projects/${projectId}/audit-log/${encodeURIComponent(r.id)}`}>
                    View
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: {sorting},
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: false, // client-side across loaded pages
  });

  // Determine whether we're in the very first loading state (no data yet, initial fetch in flight)
  const isInitialLoading = query.isLoading || (query.isFetching && messages.length === 0);

  const loadMoreRef = React.useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const observer = new IntersectionObserver(entries => {
        for (const e of entries) {
          if (e.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
            query.fetchNextPage();
          }
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    },
    [query, projectId],
  );

  const applyDateRange = (partial: Partial<FilterState>) =>
    onFiltersChange({...filters, ...partial});

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-4 py-4 items-end">
        <Input
          placeholder="Author emails (comma separated)"
          value={authorEmailsInput}
          onChange={e => setAuthorEmailsInput(e.target.value)}
          className="max-w-xs"
        />
        <Input
          placeholder="Config names (comma separated)"
          value={configNamesInput}
          onChange={e => setConfigNamesInput(e.target.value)}
          className="max-w-xs"
        />
        <Popover open={openFrom} onOpenChange={setOpenFrom}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-[180px] justify-start text-left font-normal',
                !filters.from && 'text-muted-foreground',
              )}
            >
              {filters.from ? format(filters.from, 'yyyy-MM-dd') : 'From date'}{' '}
              <ChevronDown className="ml-auto" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={filters.from}
              onSelect={d => {
                applyDateRange({from: d ?? undefined});
                setOpenFrom(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <Popover open={openTo} onOpenChange={setOpenTo}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-[180px] justify-start text-left font-normal',
                !filters.to && 'text-muted-foreground',
              )}
            >
              {filters.to ? format(filters.to, 'yyyy-MM-dd') : 'To date'}{' '}
              <ChevronDown className="ml-auto" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={filters.to}
              onSelect={d => {
                applyDateRange({to: d ?? undefined});
                setOpenTo(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    className={
                      header.column.id === 'createdAt'
                        ? 'w-[170px]'
                        : header.column.id === 'userEmail'
                          ? 'w-[180px]'
                          : header.column.id === 'configName'
                            ? 'w-[160px]'
                            : header.column.id === 'action'
                              ? 'w-[200px]'
                              : header.column.id === 'actions'
                                ? 'w-[60px]'
                                : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map(row => (
              <TableRow
                key={row.id}
                onClick={e => {
                  if (!shouldNavigateOnRowClick(e)) return;
                  router.push(
                    `/app/projects/${projectId}/audit-log/${encodeURIComponent(row.original.id)}`,
                  );
                }}
                className="cursor-pointer hover:bg-muted/50 select-text"
              >
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={table.getAllLeafColumns().length}>
                <div
                  ref={loadMoreRef}
                  className="flex justify-center py-4 text-sm text-muted-foreground"
                >
                  {isInitialLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : query.isFetchingNextPage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : query.hasNextPage ? (
                    'Scroll to load more…'
                  ) : data.length === 0 ? (
                    'No results'
                  ) : (
                    'End of results'
                  )}
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
