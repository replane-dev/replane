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
import {useMutation} from '@tanstack/react-query';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Fragment} from 'react';

export default function NewConfigPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const createConfig = useMutation(trpc.createConfig.mutationOptions());

  async function handleSubmit(data: {
    name: string;
    value: unknown;
    schema: unknown | null;
    description: string;
    ownerEmails: string[];
    editorEmails: string[];
  }) {
    await createConfig.mutateAsync({
      name: data.name,
      schema: data.schema,
      value: data.value,
      description: data.description ?? '',
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
                <BreadcrumbPage>New</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-2xl">
          <ConfigForm
            mode="new"
            role="owner"
            defaultName=""
            defaultValue={''}
            defaultSchemaEnabled={false}
            defaultSchema={''}
            defaultOwnerEmails={['example@email.com']}
            defaultEditorEmails={[]}
            defaultDescription={''}
            editorIdPrefix="new-config"
            submitting={createConfig.isPending}
            onCancel={() => router.push('/app/configs')}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </Fragment>
  );
}
