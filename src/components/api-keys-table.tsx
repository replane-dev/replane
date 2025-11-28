'use client';

import {useMutation, useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import {ArrowUpDown, ChevronDown, MoreHorizontal} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import * as React from 'react';

import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Input} from '@/components/ui/input';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useTRPC} from '@/trpc/client';

interface ApiKeyRow {
  id: string;
  name: string;
  description: string;
  createdAt: string | Date;
  creatorEmail: string | null;
  environmentId: string;
  environmentName: string;
}

function formatDateTime(value: unknown): {display: string; dateTimeAttr?: string; title?: string} {
  const d = value instanceof Date ? value : new Date(String(value ?? ''));
  if (Number.isNaN(d.getTime())) {
    return {display: String(value ?? '')};
  }
  const display = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
  return {display, dateTimeAttr: d.toISOString(), title: d.toLocaleString('en-US')};
}

function humanizeId(id: string): string {
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());
}

// columns moved inside component to use router without violating hook rules

export function ApiKeysTable({projectId}: {projectId: string}) {
  const router = useRouter();
  const qc = useQueryClient();
  const trpc = useTRPC();
  const deleteMutation = useMutation(
    trpc.deleteApiKey.mutationOptions({
      onSuccess: async () => {
        const key = trpc.getApiKeyList.queryKey();
        await qc.invalidateQueries({queryKey: key});
      },
    }),
  );

  const {
    data: {apiKeys},
  } = useSuspenseQuery(trpc.getApiKeyList.queryOptions({projectId}));

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const columns = React.useMemo<ColumnDef<ApiKeyRow>[]>(
    () => [
      {
        id: 'select',
        header: ({table}) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            aria-label="Select all"
          />
        ),
        cell: ({row}) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={value => row.toggleSelected(!!value)}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'name',
        header: 'API Key Name',
        cell: ({row}) => <div>{row.getValue('name') || '—'}</div>,
      },
      {
        accessorKey: 'environmentName',
        header: 'Environment',
        cell: ({row}) => <div>{row.getValue('environmentName') || '—'}</div>,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({row}) => {
          const value = String(row.getValue('description') || '');
          return (
            <div className="max-w-[100px] truncate" title={value}>
              {value || '—'}
            </div>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: ({column}) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Created At
            <ArrowUpDown className="ml-1 h-4 w-4" />
          </Button>
        ),
        cell: ({row}) => {
          const {display, dateTimeAttr, title} = formatDateTime(row.getValue('createdAt'));
          return (
            <time dateTime={dateTimeAttr} title={title} className="whitespace-nowrap">
              {display}
            </time>
          );
        },
      },
      {
        accessorKey: 'creatorEmail',
        header: 'Creator',
        cell: ({row}) => (
          <span className="truncate" title={String(row.getValue('creatorEmail') || '')}>
            {row.getValue('creatorEmail') || '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({row}) => {
          const apiKey = row.original;
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
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(apiKey.name || '')}>
                  Copy name
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={e => {
                    e.stopPropagation();
                    router.push(`/app/projects/${projectId}/api-keys/${apiKey.id}`);
                  }}
                >
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-700"
                  disabled={deleteMutation.isPending}
                  onClick={async e => {
                    e.stopPropagation();
                    if (confirm(`Delete API key "${apiKey.name || ''}"? This cannot be undone.`)) {
                      try {
                        await deleteMutation.mutateAsync({id: apiKey.id, projectId});
                      } catch {
                        // handled globally
                      }
                    }
                  }}
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [router, deleteMutation],
  );

  const table = useReactTable({
    data: apiKeys as ApiKeyRow[],
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  const isInteractive = (el: EventTarget | null) => {
    if (!(el instanceof Element)) return false;
    return !!el.closest(
      'button, a, [role="checkbox"], [role="menu"], input, select, textarea, [data-no-row-click]',
    );
  };

  const handleRowClick = React.useCallback(
    (e: React.MouseEvent, id: string) => {
      if (e.defaultPrevented) return;
      if (isInteractive(e.target)) return;
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      router.push(`/app/projects/${projectId}/api-keys/${id}`);
    },
    [router, projectId],
  );

  return (
    <div className="w-full">
      <div className="flex items-center py-4 gap-4">
        <Input
          placeholder="Search API keys by name"
          value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
          onChange={event => table.getColumn('name')?.setFilterValue(event.target.value)}
          className="max-w-md"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter(column => column.getCanHide())
              .map(column => {
                const header = column.columnDef.header as unknown;
                const label = typeof header === 'string' ? header : humanizeId(column.id);
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={value => column.toggleVisibility(!!value)}
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button asChild>
          <Link href={`/app/projects/${projectId}/api-keys/new`}>New API Key</Link>
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={e => handleRowClick(e, row.original.id)}
                  className="cursor-pointer select-text"
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
