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

import {Badge} from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {Button} from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Input} from '@/components/ui/input';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {formatDistanceToNow} from 'date-fns';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {useProject} from '../../../utils';

function humanizeId(id: string): string {
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());
}

export default function ConfigProposalsPage() {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [statusFilter, setStatusFilter] = React.useState<
    Array<'pending' | 'approved' | 'rejected'>
  >(['pending']);

  const {name: nameParam} = useParams<{name: string}>();
  const name = decodeURIComponent(nameParam ?? '');
  const trpc = useTRPC();
  const project = useProject();

  const {data: configData} = useSuspenseQuery(
    trpc.getConfig.queryOptions({name, projectId: project.id}),
  );
  const configId = configData.config?.config.id;
  const {data} = useSuspenseQuery(
    trpc.getConfigProposalList.queryOptions({
      projectId: project.id,
      configIds: configId ? [configId] : [],
      statuses: statusFilter.length > 0 ? statusFilter : undefined,
    }),
  );
  const proposals = React.useMemo(() => data.proposals ?? [], [data]);

  type Row = (typeof proposals)[number];

  const columns = React.useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'Proposal',
        cell: ({row}) => <div className="font-mono">{String(row.getValue('id')).slice(-8)}</div>,
      },
      {
        accessorKey: 'authorEmail',
        header: 'Author',
        cell: ({row}) => <div>{row.getValue('authorEmail') || 'Unknown'}</div>,
      },
      {
        accessorKey: 'createdAt',
        header: ({column}) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Created
            <ArrowUpDown />
          </Button>
        ),
        cell: ({row}) => (
          <span className="whitespace-nowrap">
            {formatDistanceToNow(new Date(row.getValue('createdAt') as any), {addSuffix: true})}
          </span>
        ),
      },
      {
        accessorKey: 'baseConfigVersion',
        header: 'Base version',
        cell: ({row}) => <div>{row.getValue('baseConfigVersion')}</div>,
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({row}) => {
          const proposal = row.original;
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
                    await navigator.clipboard.writeText(proposal.id);
                  }}
                >
                  Copy proposal id
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={e => {
                    e.stopPropagation();
                    router.push(
                      `/app/projects/${project.id}/configs/${encodeURIComponent(name)}/proposals/${proposal.id}`,
                    );
                  }}
                >
                  Review
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [name, project.id, router],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: proposals as Row[],
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {sorting, columnFilters, columnVisibility, rowSelection},
  });

  const handleRowClick = React.useCallback(
    (e: React.MouseEvent, proposalId: string) => {
      if (!shouldNavigateOnRowClick(e)) return;
      router.push(
        `/app/projects/${project.id}/configs/${encodeURIComponent(name)}/proposals/${proposalId}`,
      );
    },
    [router, name, project.id],
  );

  return (
    <React.Fragment>
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link href={`/app/projects/${project.id}/configs`}>Configs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link href={`/app/projects/${project.id}/configs/${encodeURIComponent(name)}`}>
                    {name}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Proposals</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="w-full">
          <div className="flex items-center py-4 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span>Proposals</span>
              <Badge variant="secondary">{proposals.length}</Badge>
            </div>
            <Input
              placeholder="Filter by author email"
              value={(table.getColumn('authorEmail')?.getFilterValue() as string) ?? ''}
              onChange={event => table.getColumn('authorEmail')?.setFilterValue(event.target.value)}
              className="max-w-md"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  {(() => {
                    const all = ['pending', 'approved', 'rejected'] as const;
                    if (statusFilter.length === 0 || statusFilter.length === all.length) {
                      return 'Status: All';
                    }
                    const labels = statusFilter
                      .map(s => s[0]!.toUpperCase() + s.slice(1))
                      .join(', ');
                    return `Status: ${labels}`;
                  })()}{' '}
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(['pending', 'approved', 'rejected'] as const).map(s => (
                  <DropdownMenuCheckboxItem
                    key={s}
                    checked={statusFilter.includes(s)}
                    onCheckedChange={checked => {
                      setStatusFilter(prev => {
                        const next = new Set(prev);
                        if (checked) next.add(s);
                        else next.delete(s);
                        return Array.from(next);
                      });
                    }}
                  >
                    {s[0]!.toUpperCase() + s.slice(1)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
                      No proposals found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}
