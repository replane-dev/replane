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
  const updateConfig = useMutation(trpc.updateConfig.mutationOptions());
  const deleteConfig = useMutation(trpc.deleteConfig.mutationOptions());

  const config = data.config;

  const defaultValue = useMemo(() => {
    if (!config) return '';
    try {
      return JSON.stringify(
        typeof config.value === 'string' ? JSON.parse(config.value) : config.value,
        null,
        2,
      );
    } catch {
      // if parsing fails, still show as string
      return typeof config.value === 'string' ? config.value : String(config.value);
    }
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
    await updateConfig.mutateAsync({
      configName: name,
      value: data.value,
      schema: data.schema,
      description: data.description,
      editorEmails: data.editorEmails,
      ownerEmails: data.ownerEmails,
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
            role="owner"
            defaultName={name}
            defaultValue={defaultValue}
            defaultSchemaEnabled={!!config?.schema}
            defaultSchema={config?.schema ? JSON.stringify(config.schema, null, 2) : ''}
            defaultDescription={config?.description ?? ''}
            defaultOwnerEmails={[]}
            defaultEditorEmails={[]}
            editorIdPrefix={`edit-config-${name}`}
            createdAt={config.createdAt}
            updatedAt={config.updatedAt}
            submitting={updateConfig.isPending}
            onCancel={() => router.push('/app/configs')}
            onDelete={async () => {
              if (confirm(`Delete config "${name}"? This cannot be undone.`)) {
                await deleteConfig.mutateAsync({name});
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
