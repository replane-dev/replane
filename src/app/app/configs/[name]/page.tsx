'use client';

import {ConfigForm} from '@/app/components/config-form';
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
import type {ConfigUserRole} from '@/engine/core/db';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';
import {Fragment, useMemo} from 'react';

// No props needed in a Client Component; use useParams() instead.

export default function ConfigByNamePage() {
  const router = useRouter();
  const {name: nameParam} = useParams<{name: string}>();
  const name = decodeURIComponent(nameParam ?? '');
  const trpc = useTRPC();
  const {data} = useSuspenseQuery(trpc.getConfig.queryOptions({name}));
  const patchConfig = useMutation(trpc.patchConfig.mutationOptions());
  const deleteConfig = useMutation(trpc.deleteConfig.mutationOptions());

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
                    <Link href="/app/configs">Configs</Link>
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
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">Config "{name}" not found.</div>
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
    if (!config) {
      throw new Error('unreachable: we do not render form when config is undefined');
    }

    await patchConfig.mutateAsync({
      configId: config?.config.id,
      prevVersion: config?.config.version,
      value: {newValue: data.value},
      schema: config?.myRole === 'owner' ? {newSchema: data.schema} : undefined,
      description: {newDescription: data.description},
      members:
        config?.myRole === 'owner'
          ? {
              newMembers: [
                ...data.ownerEmails.map(email => ({email, role: 'owner' as ConfigUserRole})),
                ...data.editorEmails.map(email => ({email, role: 'editor' as ConfigUserRole})),
              ],
            }
          : undefined,
    });
    router.push('/app/configs');
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
                  <Link href="/app/configs">Configs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-3xl space-y-6">
          <ConfigForm
            mode="edit"
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
            editorIdPrefix={`edit-config-${name}`}
            createdAt={config.config.createdAt}
            updatedAt={config.config.updatedAt}
            currentVersion={config.config.version}
            versionsLink={`/app/configs/${encodeURIComponent(name)}/versions`}
            submitting={patchConfig.isPending}
            onCancel={() => router.push('/app/configs')}
            onDelete={async () => {
              if (confirm(`Delete config "${name}"? This cannot be undone.`)) {
                await deleteConfig.mutateAsync({configId: config.config.id});
                router.push('/app/configs');
              }
            }}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </Fragment>
  );
}
