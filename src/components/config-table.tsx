'use client';

import {shouldNavigateOnRowClick} from '@/lib/table-row-interaction';
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
import {useRouter} from 'next/navigation';
import * as React from 'react';

import {useDeleteOrProposeConfig} from '@/app/app/projects/[projectId]/configs/useDeleteOrPropose';
import {useProjectId} from '@/app/app/projects/[projectId]/utils';
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
import {getQueryClient, useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {toast} from 'sonner';

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

// columns moved inside component; no hooks inside cells

export interface ConfigTableProps {
  onConfigClick?: (configName: string) => void;
  onNewConfigClick?: () => void;
}

function ConfigTableImpl({onConfigClick, onNewConfigClick}: ConfigTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const projectId = useProjectId();

  const trpc = useTRPC();
  const deleteOrPropose = useDeleteOrProposeConfig();

  const {
    data: {configs},
  } = useSuspenseQuery(trpc.getConfigList.queryOptions({projectId}));

  const columns = React.useMemo<
    ColumnDef<{
      name: string;
      descriptionPreview?: string;
      createdAt: string | Date;
      updatedAt: string | Date;
      myRole: string;
      id: string;
      version: number;
    }>[]
  >(
    () => [
      {
        accessorKey: 'name',
        header: 'Config Name',
        cell: ({row}) => <div>{row.getValue('name')}</div>,
      },
      {
        accessorKey: 'descriptionPreview',
        header: 'Description',
        cell: ({row}) => (
          <div
            className="max-w-[100px] truncate"
            title={String(row.getValue('descriptionPreview') ?? '')}
          >
            {row.getValue('descriptionPreview')}
          </div>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: ({column}) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Created At
            <ArrowUpDown />
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
        accessorKey: 'updatedAt',
        header: ({column}) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Updated At
            <ArrowUpDown />
          </Button>
        ),
        cell: ({row}) => {
          const {display, dateTimeAttr, title} = formatDateTime(row.getValue('updatedAt'));
          return (
            <time dateTime={dateTimeAttr} title={title} className="whitespace-nowrap">
              {display}
            </time>
          );
        },
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({row}) => {
          const config = row.original;
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
                  onClick={async () => {
                    await navigator.clipboard.writeText(config.name);
                    toast.success('Copied config name', {description: config.name});
                  }}
                >
                  Copy name
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={e => {
                    e.stopPropagation();
                    router.push(`/app/projects/${projectId}/configs/${config.name}`);
                  }}
                >
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-700"
                  onClick={async e => {
                    e.stopPropagation();
                    // fetch config details
                    const queryClient = getQueryClient();
                    const configDetails = await queryClient.fetchQuery(
                      trpc.getConfig.queryOptions({
                        name: config.name,
                        projectId: projectId,
                      }),
                    );
                    if (!configDetails.config) {
                      alert('Config not found');
                      return;
                    }
                    await deleteOrPropose({
                      config: configDetails.config,
                      message: null,
                      myRole: config.myRole as any,
                      prevVersion: config.version,
                      onAfterDelete: () => router.push(`/app/projects/${projectId}/configs`),
                      onAfterPropose: proposalId =>
                        router.push(
                          `/app/projects/${projectId}/configs/${encodeURIComponent(config.name)}/proposals/${proposalId}`,
                        ),
                    });
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [deleteOrPropose, projectId, router, trpc.getConfig],
  );

  const table = useReactTable({
    data: configs,
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

  const handleRowClick = React.useCallback(
    (e: React.MouseEvent, configName: string) => {
      if (!shouldNavigateOnRowClick(e)) return;
      if (onConfigClick) {
        onConfigClick(configName);
      } else {
        router.push(`/app/projects/${projectId}/configs/${encodeURIComponent(configName)}`);
      }
    },
    [router, projectId, onConfigClick],
  );

  const handleNewConfigClick = () => {
    if (onNewConfigClick) {
      onNewConfigClick();
    } else {
      router.push(`/app/projects/${projectId}/new-config`);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center py-4 gap-4">
        <Input
          placeholder="Search configs by name"
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
        <Button onClick={handleNewConfigClick}>New Config</Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={e => handleRowClick(e, row.original.name)}
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

export const ConfigTable = React.memo(ConfigTableImpl);
