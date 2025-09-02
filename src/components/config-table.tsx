'use client';

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

import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Input} from '@/components/ui/input';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useTRPC} from '@/trpc/client';
import {useMutation, useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import Link from 'next/link';

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

export const columns: ColumnDef<{
  name: string;
  descriptionPreview?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}>[] = [
  {
    id: 'select',
    header: ({table}) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
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
    header: 'Name',
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
    header: ({column}) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Created At
          <ArrowUpDown />
        </Button>
      );
    },
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
    header: ({column}) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Updated At
          <ArrowUpDown />
        </Button>
      );
    },
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
      const trpc = useTRPC();
      const qc = useQueryClient();
      const del = useMutation(
        trpc.deleteConfig.mutationOptions({
          onSuccess: async () => {
            const key = trpc.getConfigList.queryKey();
            await qc.invalidateQueries({queryKey: key});
          },
        }),
      );

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
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(config.name)}>
              Copy config name
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>View config details</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-700"
              onClick={async e => {
                e.stopPropagation();
                if (confirm(`Delete config "${config.name}"? This cannot be undone.`)) {
                  await del.mutateAsync({name: config.name});
                }
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export function ConfigTable() {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const trpc = useTRPC();
  const {
    data: {configs},
  } = useSuspenseQuery(trpc.getConfigList.queryOptions());

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

  const isInteractive = (el: EventTarget | null) => {
    if (!(el instanceof Element)) return false;
    return !!el.closest(
      'button, a, [role="checkbox"], [role="menu"], input, select, textarea, [data-no-row-click]',
    );
  };

  const handleRowClick = React.useCallback(
    (e: React.MouseEvent, configName: string) => {
      if (e.defaultPrevented) return;
      if (isInteractive(e.target)) return;
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return; // allow text selection without navigation

      router.push(`/app/configs/${encodeURIComponent(configName)}`);
    },
    [router],
  );

  return (
    <div className="w-full">
      <div className="flex items-center py-4 gap-4">
        <Input
          placeholder="Search"
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
          <Link href="/app/new-config">New Config</Link>
        </Button>
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
