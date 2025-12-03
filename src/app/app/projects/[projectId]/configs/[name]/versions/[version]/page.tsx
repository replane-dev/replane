'use client';

import {JsonEditor} from '@/components/json-editor';
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
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {format, formatDistanceToNow} from 'date-fns';
import {AlignLeft, Calendar, Code2, FileText, User} from 'lucide-react';
import Link from 'next/link';
import {notFound, useParams, useRouter} from 'next/navigation';
import {Fragment, useMemo} from 'react';
import {toast} from 'sonner';
import {useProjectId} from '../../../../utils';

export default function ConfigVersionDetailsPage() {
  const projectId = useProjectId();
  const {name: rawName, version: rawVersion} = useParams<{name: string; version: string}>();
  const name = decodeURIComponent(rawName ?? '');
  const versionNumber = Number(rawVersion);
  const trpc = useTRPC();

  // Load config first to get configId and determine environment
  const {data: configData} = useSuspenseQuery(trpc.getConfig.queryOptions({name, projectId}));
  const configInfo = configData?.config;

  // TODO: Add environment selector - for now use Production or first variant
  // Filter out default variants (where environmentId is null)
  const environmentVariants = configInfo
    ? configInfo.variants.filter(v => v.environmentId !== null && v.environmentName !== null)
    : [];

  const variant =
    environmentVariants.length > 0
      ? (environmentVariants.find(v => v.environmentName === 'Production') ??
        environmentVariants[0])
      : null;

  // Load version for the selected variant
  const hasVariant = !!configInfo && !!variant;
  const {data} = useSuspenseQuery(
    trpc.getConfigVariantVersion.queryOptions({
      configId: hasVariant ? configInfo.config.id : '',
      environmentId: hasVariant ? variant.environmentId! : '',
      version: versionNumber,
      projectId,
    }),
  );

  const currentVariantVersion = variant?.version as number | undefined;
  const restoreMutation = useMutation(trpc.restoreConfigVariantVersion.mutationOptions());
  const router = useRouter();
  const version = data.version;

  // Trigger 404 page if version doesn't exist
  if (!version) {
    notFound();
  }

  const valueJson = useMemo(() => JSON.stringify(version.value, null, 2), [version]);
  const schemaJson = useMemo(
    () =>
      version.schema !== null && version.schema !== undefined
        ? JSON.stringify(version.schema, null, 2)
        : null,
    [version],
  );

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
                  <Link href={`/app/projects/${projectId}/configs`}>Configs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link href={`/app/projects/${projectId}/configs/${encodeURIComponent(name)}`}>
                    {name}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link
                    href={`/app/projects/${projectId}/configs/${encodeURIComponent(name)}/versions`}
                  >
                    Versions
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>v{versionNumber}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-4xl space-y-6">
          {version && (
            <>
              {/* Version Info */}
              <div className="rounded-lg border bg-card/50 p-4">
                <div className="space-y-4">
                  {/* Version number and restore action */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/app/projects/${projectId}/configs/${encodeURIComponent(name)}`}
                        className="text-lg font-semibold text-foreground hover:text-foreground/80 transition-colors"
                      >
                        {name}
                      </Link>
                      <span className="text-muted-foreground">·</span>
                      <Badge variant="secondary" className="text-sm font-semibold px-3 py-1">
                        Version {version.version}
                      </Badge>
                      {currentVariantVersion === version.version && (
                        <Badge variant="outline" className="text-xs">
                          Current
                        </Badge>
                      )}
                    </div>
                    {currentVariantVersion !== undefined &&
                      currentVariantVersion !== version.version &&
                      hasVariant && (
                        <Button
                          size="sm"
                          disabled={
                            restoreMutation.isPending || currentVariantVersion !== variant.version
                          }
                          onClick={async () => {
                            if (
                              !confirm(
                                `Restore version ${version.version}? This will create a new version with the same contents (current version: ${currentVariantVersion}).`,
                              )
                            ) {
                              return;
                            }
                            try {
                              await restoreMutation.mutateAsync({
                                configId: configInfo.config.id,
                                environmentId: variant.environmentId!,
                                versionToRestore: version.version,
                                expectedCurrentVersion: currentVariantVersion,
                                projectId,
                              });
                              toast.success('Version restored successfully');
                              router.push(
                                `/app/projects/${projectId}/configs/${encodeURIComponent(name)}`,
                              );
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          {restoreMutation.isPending ? 'Restoring…' : 'Restore'}
                        </Button>
                      )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Created */}
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground mb-0.5">Created</div>
                        <div className="text-sm font-medium">
                          {formatDistanceToNow(new Date(version.createdAt), {addSuffix: true})}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(version.createdAt), 'PPpp')}
                        </div>
                      </div>
                    </div>

                    {/* Author */}
                    {version.authorEmail && (
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground mb-0.5">Author</div>
                          <div className="text-sm font-medium break-all">{version.authorEmail}</div>
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    {version.description && (
                      <div className="flex items-start gap-2.5 sm:col-span-2">
                        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0 mt-0.5">
                          <AlignLeft className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground mb-0.5">Description</div>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {version.description}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Value */}
              <div className="rounded-lg border bg-card/50 overflow-hidden">
                <div className="border-b bg-muted/30 px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-base font-semibold text-foreground">Value</h3>
                  </div>
                </div>
                <div className="p-6">
                  <JsonEditor
                    id={`config-value-${version.version}`}
                    aria-label="Config value JSON"
                    value={valueJson}
                    onChange={() => {}}
                    readOnly
                    height={300}
                  />
                </div>
              </div>

              {/* Schema */}
              <div className="rounded-lg border bg-card/50 overflow-hidden">
                <div className="border-b bg-muted/30 px-6 py-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-base font-semibold text-foreground">Schema</h3>
                  </div>
                </div>
                <div className="p-6">
                  {schemaJson ? (
                    <JsonEditor
                      id={`config-schema-${version.version}`}
                      aria-label="Config schema JSON"
                      value={schemaJson}
                      onChange={() => {}}
                      readOnly
                      height={260}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-6">
                      <p className="text-center text-sm text-muted-foreground">
                        No schema defined for this version
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Fragment>
  );
}
