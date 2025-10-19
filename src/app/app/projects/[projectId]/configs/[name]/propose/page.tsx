'use client';

import {ConfigForm} from '@/components/config-form';
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
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';
import {Fragment, useMemo} from 'react';
import {useProject} from '../../../utils';

export default function ProposeConfigChangesPage() {
  const router = useRouter();
  const {name: nameParam} = useParams<{name: string}>();
  const name = decodeURIComponent(nameParam ?? '');
  const trpc = useTRPC();
  const {data} = useSuspenseQuery(trpc.getConfig.queryOptions({name, projectId: useProject().id}));
  const createProposal = useMutation(trpc.createConfigProposal.mutationOptions());
  const project = useProject();

  const config = data.config;

  const defaultValue = useMemo(() => {
    if (!config) return '';
    return JSON.stringify(config.config.value, null, 2);
  }, [config]);

  if (!config) {
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
                    <Link href="/app/projects">Projects</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild>
                    <Link href={`/app/projects/${project.id}`}>{project.name}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild>
                    <Link href={`/app/projects/${project.id}/configs`}>Configs</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Not found</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          Config &quot;{name}&quot; not found.
        </div>
      </Fragment>
    );
  }

  async function handleSubmit(data: {
    name: string;
    value: unknown;
    schema: unknown | null;
    description: string;
    ownerEmails: string[];
    editorEmails: string[];
  }) {
    if (!config) throw new Error('Config not loaded');

    // Compute diffs vs current config and only send changed fields
    const proposedValue =
      JSON.stringify(data.value) !== JSON.stringify(config.config.value)
        ? {newValue: data.value}
        : undefined;

    const proposedDescription =
      (data.description ?? '') !== (config.config.description ?? '')
        ? {newDescription: data.description ?? ''}
        : undefined;

    const currentSchema = config.config.schema ?? null;
    const proposedSchema =
      JSON.stringify(data.schema ?? null) !== JSON.stringify(currentSchema)
        ? {newSchema: data.schema}
        : undefined;

    if (!proposedValue && !proposedDescription && !proposedSchema) {
      // Nothing to propose
      alert('No changes detected. Update a field to create a proposal.');
      return;
    }

    await createProposal.mutateAsync({
      configId: config.config.id,
      proposedValue,
      proposedDescription,
      proposedSchema,
    });

    router.push(`/app/projects/${project.id}/configs/${encodeURIComponent(name)}`);
  }

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
                  <Link href={`/app/projects/${project.id}/configs`}>Configs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Propose changes · {name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-3xl space-y-6">
          <ConfigForm
            mode="proposal"
            role={config.myRole}
            defaultName={name}
            defaultValue={defaultValue}
            defaultSchemaEnabled={!!config.config?.schema}
            defaultSchema={
              config.config?.schema ? JSON.stringify(config.config.schema, null, 2) : ''
            }
            defaultDescription={config.config?.description ?? ''}
            defaultOwnerEmails={config.ownerEmails}
            defaultEditorEmails={config.editorEmails}
            editorIdPrefix={`propose-config-${name}`}
            createdAt={config.config.createdAt}
            updatedAt={config.config.updatedAt}
            currentVersion={config.config.version}
            versionsLink={`/app/projects/${project.id}/configs/${encodeURIComponent(name)}/versions`}
            submitting={createProposal.isPending}
            onCancel={() =>
              router.push(`/app/projects/${project.id}/configs/${encodeURIComponent(name)}`)
            }
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </Fragment>
  );
}
