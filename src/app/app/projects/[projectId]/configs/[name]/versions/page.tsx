'use client';

import {ConfigVersionsTable} from '@/components/config-versions-table';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {Fragment, useMemo, useState} from 'react';
import {useProjectId} from '../../../utils';

export default function ConfigVersionsPage() {
  const {name: rawName} = useParams<{name: string}>();
  const name = decodeURIComponent(rawName ?? '');
  const trpc = useTRPC();
  const projectId = useProjectId();
  // TODO: we should select the default environment (project always has one)
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);

  // Load config first to get its ID
  const {data: configData} = useSuspenseQuery(trpc.getConfig.queryOptions({name, projectId}));
  const configInfo = configData?.config;

  // Select environment: use selected, or default to Production, or first variant
  // Filter out default variants (where environmentId is null)
  const environmentVariants = useMemo(
    () =>
      configInfo?.variants.filter(v => v.environmentId !== null && v.environmentName !== null) ??
      [],
    [configInfo?.variants],
  );

  const variant = useMemo(() => {
    if (environmentVariants.length === 0) return null;

    // TODO: we should always have a selected env
    if (selectedEnvironmentId) {
      const v = environmentVariants.find(v => v.environmentId === selectedEnvironmentId);
      if (v) return v;

      throw new Error('Variant not found');
    }

    return (
      environmentVariants.find(v => v.environmentName === 'Production') ?? environmentVariants[0]
    );
  }, [environmentVariants, selectedEnvironmentId]);

  // Load versions for the selected variant (only if we have config and variant)
  const hasVariant = !!configInfo && !!variant;
  const {data: versionsData} = useSuspenseQuery(
    trpc.getConfigVariantVersionList.queryOptions({
      configId: hasVariant ? configInfo.config.id : '',
      environmentId: hasVariant ? variant.environmentId! : '',
      projectId,
    }),
  );
  const versions = hasVariant ? (versionsData?.versions ?? []) : [];

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
              <BreadcrumbItem>
                <BreadcrumbPage>Versions</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-6xl space-y-6">
          {/* Environment Selector */}
          {environmentVariants.length > 1 && (
            <div className="flex items-center gap-4">
              <Label htmlFor="environment-select" className="text-sm font-medium shrink-0">
                Environment:
              </Label>
              <Select value={variant?.environmentId || ''} onValueChange={setSelectedEnvironmentId}>
                <SelectTrigger id="environment-select" className="w-[200px]">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  {environmentVariants.map(v => (
                    <SelectItem key={v.environmentId!} value={v.environmentId!}>
                      {v.environmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!configInfo && <div>Config &quot;{name}&quot; not found.</div>}
          {configInfo && !variant && <div>No environment variants found for this config.</div>}
          {configInfo && variant && versions.length === 0 && <div>No versions yet.</div>}
          {configInfo && variant && versions.length > 0 && (
            <ConfigVersionsTable
              name={name}
              configId={configInfo.config.id}
              environmentId={variant.environmentId!}
            />
          )}
        </div>
      </div>
    </Fragment>
  );
}
