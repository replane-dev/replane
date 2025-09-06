'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {Calendar, User} from 'lucide-react';
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';
import {Fragment, useMemo} from 'react';

export default function ConfigVersionDetailsPage() {
  const {name: rawName, version: rawVersion} = useParams<{name: string; version: string}>();
  const name = decodeURIComponent(rawName ?? '');
  const versionNumber = Number(rawVersion);
  const trpc = useTRPC();
  const {data} = useSuspenseQuery(
    trpc.getConfigVersion.queryOptions({name, version: versionNumber}),
  );
  const {data: configData} = useSuspenseQuery(trpc.getConfig.queryOptions({name}));
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
                  <Link href="/app/configs">Configs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link href={`/app/configs/${encodeURIComponent(name)}`}>{name}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link href={`/app/configs/${encodeURIComponent(name)}/versions`}>Versions</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{versionNumber}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {!version && <div>Version {versionNumber} not found.</div>}
        {version && (
          <div className="space-y-4 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1">
                <Calendar className="h-3 w-3" /> {meta?.full}
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1">
                <User className="h-3 w-3" /> {version.authorEmail ?? 'Unknown author'}
              </span>
            </div>
            {currentConfigVersion !== undefined && (
              <div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
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
                      router.push(`/app/configs/${encodeURIComponent(name)}`);
                    } catch (e) {
                      // eslint-disable-next-line no-alert
                      alert((e as Error).message);
                    }
                  }}
                >
                  {restoreMutation.isPending ? 'Restoring…' : 'Restore this version'}
                </button>
              </div>
            )}
            <div>
              <h2 className="font-semibold mb-2">Description</h2>
              <p className="whitespace-pre-wrap text-sm">{version.description || '—'}</p>
            </div>
            <div>
              <h2 className="font-semibold mb-2">Value</h2>
              <pre className="rounded bg-muted p-3 text-xs overflow-auto">
                {JSON.stringify(version.value, null, 2)}
              </pre>
            </div>
            {version.schema !== null && version.schema !== undefined && (
              <div>
                <h2 className="font-semibold mb-2">Schema</h2>
                <pre className="rounded bg-muted p-3 text-xs overflow-auto">
                  {JSON.stringify(version.schema, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </Fragment>
  );
}
