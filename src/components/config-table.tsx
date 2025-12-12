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
import {
  ArrowUpDown,
  ChevronDown,
  Code,
  ExternalLink,
  FileCode,
  FileCog,
  MoreHorizontal,
} from 'lucide-react';
import {useRouter} from 'next/navigation';
import * as React from 'react';

import {useDeleteOrProposeConfig} from '@/app/app/projects/[projectId]/configs/useDeleteOrPropose';
import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {GenerateTypesDialog} from '@/components/generate-types-dialog';
import {SdkIntegrationGuide} from '@/components/sdk-integration-guide';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogDescription, DialogTitle} from '@/components/ui/dialog';
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
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {Suspense} from 'react';
import {toast} from 'sonner';

const isDevelopment = process.env.NODE_ENV === 'development';

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
  showSdkGuide?: boolean;
  showCodegen?: boolean;
  onSdkGuideClick?: () => void;
  onCodegenClick?: () => void;
  onSdkGuideChange?: (open: boolean) => void;
  onCodegenChange?: (open: boolean) => void;
}

function ConfigTableImpl({
  onConfigClick,
  onNewConfigClick,
  showSdkGuide = false,
  showCodegen = false,
  onSdkGuideClick,
  onCodegenClick,
  onSdkGuideChange,
  onCodegenChange,
}: ConfigTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const projectId = useProjectId();

  const trpc = useTRPC();
  const deleteOrPropose = useDeleteOrProposeConfig();

  const configListQuery = useSuspenseQuery(trpc.getConfigList.queryOptions({projectId}));
  const {configs} = configListQuery.data;

  const addExampleConfigsMutation = useMutation(
    trpc.addExampleConfigs.mutationOptions({
      onSuccess: data => {
        if (data.addedConfigsCount > 0) {
          toast.success(`Added ${data.addedConfigsCount} example config(s)`);
          configListQuery.refetch();
        } else {
          toast.info('All example configs already exist');
        }
      },
      onError: error => {
        toast.error('Failed to add example configs', {description: error.message});
      },
    }),
  );

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
        header: 'Config name',
        cell: ({row}) => <div>{row.getValue('name')}</div>,
      },
      {
        accessorKey: 'descriptionPreview',
        header: 'Description',
        cell: ({row}) => (
          <div
            className="max-w-[400px] truncate"
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
            className="-ml-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Created
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({row}) => {
          const {display, dateTimeAttr, title} = formatDateTime(row.getValue('createdAt'));
          return (
            <time dateTime={dateTimeAttr} title={title}>
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
            className="-ml-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Updated
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({row}) => {
          const {display, dateTimeAttr, title} = formatDateTime(row.getValue('updatedAt'));
          return (
            <time dateTime={dateTimeAttr} title={title}>
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
                    if (onConfigClick) {
                      onConfigClick(config.name);
                    } else {
                      router.push(`/app/projects/${projectId}/configs/${config.name}`);
                    }
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
    [deleteOrPropose, onConfigClick, projectId, router, trpc.getConfig],
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

  // Empty state
  if (configs.length === 0) {
    return (
      <div className="w-full">
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="rounded-full bg-muted/50 p-4 mb-6">
            <FileCog className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No configs yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-8">
            Configs are dynamic values you can change without redeploying. Create your first config
            to get started.
          </p>
          <div className="flex gap-3">
            {isDevelopment && (
              <Button
                variant="outline"
                onClick={() => addExampleConfigsMutation.mutate({projectId})}
                disabled={addExampleConfigsMutation.isPending}
              >
                {addExampleConfigsMutation.isPending ? 'Adding...' : 'Add examples'}
              </Button>
            )}
            <Button onClick={handleNewConfigClick}>Create config</Button>
          </div>

          {/* Helpful links */}
          <div className="mt-12 pt-8 border-t">
            <div className="flex justify-center">
              <a
                href="https://replane.dev/docs/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Read documentation
              </a>
            </div>
          </div>
        </div>

        {/* Integration Guide Dialog */}
        {onSdkGuideChange && (
          <Dialog open={showSdkGuide} onOpenChange={onSdkGuideChange}>
            <DialogContent className="lg:max-w-4xl md:max-w-2xl w-full max-h-[85vh] overflow-y-auto">
              <DialogTitle>SDK Integration Guide</DialogTitle>
              <DialogDescription>
                Learn how to integrate Replane into your application
              </DialogDescription>
              <SdkIntegrationGuide projectId={projectId} />
            </DialogContent>
          </Dialog>
        )}

        {/* Generate Types Dialog */}
        {onCodegenChange && (
          <GenerateTypesDialog open={showCodegen} onOpenChange={onCodegenChange} />
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center py-4 gap-4">
        <Input
          placeholder="Search configs by name"
          value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
          onChange={event => table.getColumn('name')?.setFilterValue(event.target.value)}
          className="max-w-md"
        />
        <Button variant="outline" className="ml-auto" onClick={onCodegenClick}>
          <FileCode className="h-4 w-4 mr-2" />
          Generate types
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
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
        <Button onClick={handleNewConfigClick}>New config</Button>
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
                  No configs yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Integration tips */}
      <div className="mt-8 text-center">
        <p className="text-sm font-semibold text-muted-foreground mb-2">
          Ready to integrate project configs into your app?
        </p>
        <button
          onClick={onSdkGuideClick}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Code className="h-3.5 w-3.5" />
          View integration guide for this project
        </button>
      </div>

      {/* Integration Guide Dialog */}
      {onSdkGuideChange && (
        <Dialog open={showSdkGuide} onOpenChange={onSdkGuideChange}>
          <DialogContent className="lg:max-w-4xl md:max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <DialogTitle>SDK Integration Guide</DialogTitle>
            <DialogDescription>
              Follow these steps to integrate Replane SDK into your application
            </DialogDescription>
            <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
              <SdkIntegrationGuide projectId={projectId} />
            </Suspense>
          </DialogContent>
        </Dialog>
      )}

      {/* Generate Types Dialog */}
      {onCodegenChange && <GenerateTypesDialog open={showCodegen} onOpenChange={onCodegenChange} />}
    </div>
  );
}

export const ConfigTable = React.memo(ConfigTableImpl);
