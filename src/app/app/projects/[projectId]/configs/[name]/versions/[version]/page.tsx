'use client';

import {ConfigForm} from '@/components/config-form';
import {Badge} from '@/components/ui/badge';
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
import {useSuspenseQuery} from '@tanstack/react-query';
import {CheckCircle2, FileText, GitCommitVertical, User} from 'lucide-react';
import Link from 'next/link';
import {notFound, useParams} from 'next/navigation';
import {Fragment, useMemo} from 'react';
import {useProjectId} from '../../../../utils';

export default function ConfigVersionDetailsPage() {
  const {name: rawName, version: rawVersion} = useParams<{name: string; version: string}>();
  const name = decodeURIComponent(rawName ?? '');
  const version = parseInt(rawVersion ?? '', 10);
  const projectId = useProjectId();
  const trpc = useTRPC();

  // Validate version is a valid number
  if (isNaN(version) || version < 1) {
    notFound();
  }

  // Load config first to get its ID
  const {data: configData} = useSuspenseQuery(trpc.getConfig.queryOptions({name, projectId}));
  const configInfo = configData?.config;

  if (!configInfo) {
    notFound();
  }

  // Load environments
  const {data: environmentsData} = useSuspenseQuery(
    trpc.getProjectEnvironments.queryOptions({projectId}),
  );
  const environments = useMemo(
    () => environmentsData?.environments ?? [],
    [environmentsData?.environments],
  );

  // Load project users for the form
  const {data: projectUsersData} = useSuspenseQuery(trpc.getProjectUsers.queryOptions({projectId}));
  const projectUsers = useMemo(
    () =>
      (projectUsersData?.users ?? []).map(u => ({
        email: u.email,
        role: u.role as 'admin' | 'maintainer',
      })),
    [projectUsersData?.users],
  );

  // Load the specific version
  const {data: versionData} = useSuspenseQuery(
    trpc.getConfigVariantVersion.queryOptions({
      configId: configInfo.config.id,
      version,
      projectId,
    }),
  );

  const versionSnapshot = versionData?.version;

  if (!versionSnapshot) {
    notFound();
  }

  const isCurrentVersion = version === configInfo.config.version;

  // Transform version data for ConfigForm
  const defaultVariant = useMemo(
    () => ({
      value: versionSnapshot.value,
      schema: versionSnapshot.schema,
      overrides: versionSnapshot.overrides,
    }),
    [versionSnapshot.value, versionSnapshot.schema, versionSnapshot.overrides],
  );

  const environmentVariants = useMemo(
    () =>
      versionSnapshot.variants.map(v => ({
        environmentId: v.environmentId,
        value: v.value,
        schema: v.schema,
        overrides: v.overrides,
        useBaseSchema: v.schema === null,
      })),
    [versionSnapshot.variants],
  );

  const maintainerEmails = useMemo(
    () => versionSnapshot.members.filter(m => m.role === 'maintainer').map(m => m.email),
    [versionSnapshot.members],
  );

  const editorEmails = useMemo(
    () => versionSnapshot.members.filter(m => m.role === 'editor').map(m => m.email),
    [versionSnapshot.members],
  );

  const formEnvironments = useMemo(
    () =>
      environments.map(env => ({
        id: env.id,
        name: env.name,
        requireProposals: env.requireProposals,
      })),
    [environments],
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
                <BreadcrumbPage>v{version}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-4xl space-y-6">
          {/* Version header */}
          <div className="rounded-lg border bg-card/50 p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                  {isCurrentVersion ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <GitCommitVertical className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <span className="text-sm font-semibold">Version {version}</span>
                {isCurrentVersion && (
                  <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                    Current
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Author */}
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Author</div>
                    <div className="text-sm font-medium">
                      {versionSnapshot.authorEmail ?? 'Unknown'}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Description</div>
                    <div
                      className="text-sm font-medium truncate"
                      title={versionSnapshot.description}
                    >
                      {versionSnapshot.description || '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Config form in view mode */}
          <ConfigForm
            mode="view"
            role="viewer"
            currentName={name}
            environments={formEnvironments}
            requireProposals={false}
            defaultVariant={defaultVariant}
            environmentVariants={environmentVariants}
            defaultDescription={versionSnapshot.description}
            defaultMaintainerEmails={maintainerEmails}
            defaultEditorEmails={editorEmails}
            currentVersion={version}
            projectUsers={projectUsers}
          />
        </div>
      </div>
    </Fragment>
  );
}
