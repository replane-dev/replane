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

interface FilterState {
  authorEmails: string;
  configNames: string;
  from?: Date;
  to?: Date;
}

function humanizePayload(payload: any): {action: string; details: string} {
  if (!payload || typeof payload !== 'object') return {action: 'unknown', details: ''};
  const type = payload.type ?? 'unknown';
  switch (type) {
    case 'config_created':
      return {action: 'Config Created', details: payload.config?.name ?? ''};
    case 'config_updated':
      return {action: 'Config Updated', details: payload.after?.name ?? ''};
    case 'config_deleted':
      return {action: 'Config Deleted', details: payload.config?.name ?? ''};
    case 'config_version_restored':
      return {
        action: 'Config Version Restored',
        details: `${payload.after?.name} -> v${payload.restoredFromVersion}`,
      };
    case 'api_key_created':
      return {action: 'API Key Created', details: payload.apiKey?.name ?? ''};
    case 'api_key_deleted':
      return {action: 'API Key Deleted', details: payload.apiKey?.name ?? ''};
    case 'config_members_changed':
      return {action: 'Config Members Changed', details: payload.config?.name ?? ''};
    default:
      return {action: String(type), details: ''};
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

export function AuditLogTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [filters, setFilters] = React.useState<FilterState>({authorEmails: '', configNames: ''});
  // Raw input values (debounced before applying to filters state that drives the query)
  const [authorEmailsInput, setAuthorEmailsInput] = React.useState('');
  const [configNamesInput, setConfigNamesInput] = React.useState('');
  const [openFrom, setOpenFrom] = React.useState(false);
  const [openTo, setOpenTo] = React.useState(false);

  // Debounce textual filter changes so we don't refetch on every keystroke
  React.useEffect(() => {
    const handle = setTimeout(() => {
      setFilters(f => ({
        ...f,
        authorEmails: authorEmailsInput,
        configNames: configNamesInput,
      }));
    }, 400); // 400ms debounce window
    return () => clearTimeout(handle);
  }, [authorEmailsInput, configNamesInput]);

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
      const opts = trpc.getAuditLog.queryOptions({...baseInput, cursor: cursor ?? undefined});
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
        accessorKey: 'userEmail',
        header: 'Author',
        cell: ({row}) => row.original.userEmail ?? '—',
      },
      {
        accessorKey: 'configName',
        header: 'Config',
        cell: ({row}) => row.original.configName ?? '—',
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
                  <Link href={`/app/audit-log/${encodeURIComponent(r.id)}`}>View</Link>
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
    [query],
  );

  const applyDateRange = (partial: Partial<FilterState>) => setFilters(f => ({...f, ...partial}));

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
                  router.push(`/app/audit-log/${encodeURIComponent(row.original.id)}`);
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
