'use client';

import {JsonEditor} from '@/components/json-editor';
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
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {Calendar, User} from 'lucide-react';
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';
import {Fragment, useMemo} from 'react';
import {useProjectId} from '../../../../utils';

export default function ConfigVersionDetailsPage() {
  const projectId = useProjectId();
  const {name: rawName, version: rawVersion} = useParams<{name: string; version: string}>();
  const name = decodeURIComponent(rawName ?? '');
  const versionNumber = Number(rawVersion);
  const trpc = useTRPC();
  const {data} = useSuspenseQuery(
    trpc.getConfigVersion.queryOptions({name, version: versionNumber, projectId}),
  );
  const {data: configData} = useSuspenseQuery(trpc.getConfig.queryOptions({name, projectId}));
  const currentConfigVersion = configData.config?.config.version as number | undefined;
  const restoreMutation = useMutation(trpc.restoreConfigVersion.mutationOptions());
  const router = useRouter();
  const version = data.version;

  const meta = useMemo(() => {
    if (!version) return null;
    const createdAt = new Date(version.createdAt);
    const full = createdAt.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return {full};
  }, [version]);

  const valueJson = useMemo(
    () => (version ? JSON.stringify(version.value, null, 2) : ''),
    [version],
  );
  const schemaJson = useMemo(
    () =>
      version && version.schema !== null && version.schema !== undefined
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
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0 max-w-4xl">
        {!version && (
          <Card>
            <CardContent className="p-6">Version {versionNumber} not found.</CardContent>
          </Card>
        )}
        {version && (
          <Card>
            <CardHeader>
              <CardTitle>Version v{version.version}</CardTitle>
              <CardDescription>
                <div className="pt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1">
                    <Calendar className="h-3 w-3" /> {meta?.full}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1">
                    <User className="h-3 w-3" /> {version.authorEmail ?? 'Unknown author'}
                  </span>
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h2 className="font-semibold mb-2">Description</h2>
                <p className="whitespace-pre-wrap text-sm">{version.description || '—'}</p>
              </div>
              <div>
                <h2 className="font-semibold mb-2">Value</h2>
                <JsonEditor
                  id={`config-value-${version.version}`}
                  aria-label="Config value JSON"
                  value={valueJson}
                  onChange={() => {}}
                  readOnly
                  height={300}
                />
              </div>
              {schemaJson && (
                <div>
                  <h2 className="font-semibold mb-2">Schema</h2>
                  <JsonEditor
                    id={`config-schema-${version.version}`}
                    aria-label="Config schema JSON"
                    value={schemaJson}
                    onChange={() => {}}
                    readOnly
                    height={260}
                  />
                </div>
              )}
            </CardContent>
            <CardFooter>
              {currentConfigVersion !== undefined && (
                <Button
                  disabled={
                    restoreMutation.isPending ||
                    currentConfigVersion !== configData.config?.config.version
                  }
                  onClick={async () => {
                    if (
                      !confirm(
                        `Restore version v${version.version}? This will create a new version with the same contents (current v${currentConfigVersion}).`,
                      )
                    ) {
                      return;
                    }
                    try {
                      await restoreMutation.mutateAsync({
                        name,
                        versionToRestore: version.version,
                        expectedCurrentVersion: currentConfigVersion,
                      });
                      router.push(`/app/projects/${projectId}/configs/${encodeURIComponent(name)}`);
                    } catch (e) {
                      // eslint-disable-next-line no-alert
                      alert((e as Error).message);
                    }
                  }}
                >
                  {restoreMutation.isPending ? 'Restoring…' : 'Restore this version'}
                </Button>
              )}
            </CardFooter>
          </Card>
        )}
      </div>
    </Fragment>
  );
}
