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
import {ArrowUpDown, ChevronDown, KeyRound, MoreHorizontal, Plus} from 'lucide-react';
import * as React from 'react';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Input} from '@/components/ui/input';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import type {AdminApiKeyScope} from '@/engine/core/identity';
import {useTRPC} from '@/trpc/client';
import {toast} from 'sonner';

interface AdminApiKeyRow {
  id: string;
  name: string;
  description: string;
  keyPrefix: string;
  createdByEmail: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  scopes: AdminApiKeyScope[];
  projectIds: string[] | null;
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

export interface AdminApiKeysTableProps {
  workspaceId: string;
  onNewApiKeyClick?: () => void;
}

export function AdminApiKeysTable({workspaceId, onNewApiKeyClick}: AdminApiKeysTableProps) {
  const qc = useQueryClient();
  const trpc = useTRPC();

  const deleteMutation = useMutation(
    trpc.deleteAdminApiKey.mutationOptions({
      onSuccess: async () => {
        const key = trpc.listAdminApiKeys.queryKey();
        await qc.invalidateQueries({queryKey: key});
        toast.success('API key deleted');
      },
      onError: err => {
        toast.error(err?.message ?? 'Failed to delete API key');
      },
    }),
  );

  const {
    data: {adminApiKeys},
  } = useSuspenseQuery(trpc.listAdminApiKeys.queryOptions({workspaceId}));

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const columns = React.useMemo<ColumnDef<AdminApiKeyRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({row}) => (
          <div className="font-medium">{row.getValue('name') || '—'}</div>
        ),
      },
      {
        accessorKey: 'keyPrefix',
        header: 'Key prefix',
        cell: ({row}) => (
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
            {row.getValue('keyPrefix')}...
          </code>
        ),
      },
      {
        accessorKey: 'scopes',
        header: 'Scopes',
        cell: ({row}) => {
          const scopes = row.getValue('scopes') as AdminApiKeyScope[];
          const displayScopes = scopes.slice(0, 2);
          const remaining = scopes.length - displayScopes.length;
          return (
            <div className="flex flex-wrap gap-1">
              {displayScopes.map(scope => (
                <Badge key={scope} variant="secondary" className="text-xs">
                  {scope}
                </Badge>
              ))}
              {remaining > 0 && (
                <Badge variant="outline" className="text-xs">
                  +{remaining} more
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'projectIds',
        header: 'Projects',
        cell: ({row}) => {
          const projectIds = row.getValue('projectIds') as string[] | null;
          if (projectIds === null) {
            return <span className="text-muted-foreground text-sm">All projects</span>;
          }
          return (
            <span className="text-sm">
              {projectIds.length} project{projectIds.length !== 1 ? 's' : ''}
            </span>
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
            Created
            <ArrowUpDown className="ml-1 h-4 w-4" />
          </Button>
        ),
        cell: ({row}) => {
          const {display, dateTimeAttr, title} = formatDateTime(row.getValue('createdAt'));
          return (
            <time dateTime={dateTimeAttr} title={title} className="whitespace-nowrap text-sm">
              {display}
            </time>
          );
        },
      },
      {
        accessorKey: 'lastUsedAt',
        header: 'Last used',
        cell: ({row}) => {
          const value = row.getValue('lastUsedAt') as Date | null;
          if (!value) {
            return <span className="text-muted-foreground text-sm">Never</span>;
          }
          const {display, dateTimeAttr, title} = formatDateTime(value);
          return (
            <time dateTime={dateTimeAttr} title={title} className="whitespace-nowrap text-sm">
              {display}
            </time>
          );
        },
      },
      {
        accessorKey: 'expiresAt',
        header: 'Expires',
        cell: ({row}) => {
          const value = row.getValue('expiresAt') as Date | null;
          if (!value) {
            return <span className="text-muted-foreground text-sm">Never</span>;
          }
          const isExpired = new Date(value) < new Date();
          const {display, dateTimeAttr, title} = formatDateTime(value);
          return (
            <time
              dateTime={dateTimeAttr}
              title={title}
              className={`whitespace-nowrap text-sm ${isExpired ? 'text-destructive' : ''}`}
            >
              {display}
              {isExpired && ' (expired)'}
            </time>
          );
        },
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
                <DropdownMenuItem
                  onClick={() => navigator.clipboard.writeText(apiKey.keyPrefix)}
                >
                  Copy key prefix
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-700"
                  disabled={deleteMutation.isPending}
                  onClick={async e => {
                    e.stopPropagation();
                    if (confirm(`Delete API key "${apiKey.name}"? This cannot be undone.`)) {
                      try {
                        await deleteMutation.mutateAsync({
                          workspaceId,
                          adminApiKeyId: apiKey.id,
                        });
                      } catch {
                        // handled in onError
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
    [deleteMutation, workspaceId],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: adminApiKeys as AdminApiKeyRow[],
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  });

  // Empty state
  if (adminApiKeys.length === 0) {
    return (
      <div className="w-full">
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="rounded-full bg-muted/50 p-4 mb-6">
            <KeyRound className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No API keys yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            API keys allow programmatic access to your workspace. Create an API key to integrate
            with CI/CD pipelines or other automation tools.
          </p>
          {onNewApiKeyClick && (
            <Button onClick={onNewApiKeyClick}>
              <Plus className="mr-2 h-4 w-4" />
              Create API key
            </Button>
          )}
        </div>
      </div>
    );
  }

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
        {onNewApiKeyClick && (
          <Button onClick={onNewApiKeyClick}>
            <Plus className="mr-2 h-4 w-4" />
            New API key
          </Button>
        )}
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
                <TableRow key={row.id}>
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
                  No API keys found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

