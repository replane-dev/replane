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
import type {Override} from '@/engine/core/override-evaluator';
import {useTRPC} from '@/trpc/client';
import {useMutation} from '@tanstack/react-query';
import {useSession} from 'next-auth/react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Fragment} from 'react';
import {useProjectId} from '../utils';

export default function NewConfigPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const createConfig = useMutation(trpc.createConfig.mutationOptions());
  const {data: session, status} = useSession();
  const projectId = useProjectId();

  // While session is loading, avoid asserting (email would be undefined briefly)
  if (status === 'loading') {
    return null; // Could render a spinner / skeleton if desired
  }

  const userEmail = session?.user?.email;
  if (!userEmail) throw new Error('User email is required');

  async function handleSubmit(data: {
    name: string;
    value: unknown;
    schema: unknown | null;
    overrides: Override[];
    description: string;
    maintainerEmails: string[];
    editorEmails: string[];
  }) {
    await createConfig.mutateAsync({
      name: data.name,
      schema: data.schema,
      value: data.value,
      overrides: data.overrides,
      description: data.description ?? '',
      editorEmails: data.editorEmails,
      maintainerEmails: data.maintainerEmails,
      projectId,
    });
    router.push(`/app/projects/${projectId}/configs`);
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
                  <Link href={`/app/projects/${projectId}/configs`}>Configs</Link>
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
            role="maintainer"
            defaultValue={''}
            defaultSchemaEnabled={false}
            defaultSchema={''}
            defaultMaintainerEmails={[userEmail!]}
            defaultEditorEmails={[]}
            defaultDescription={''}
            editorIdPrefix="new-config"
            saving={createConfig.isPending}
            onCancel={() => router.push(`/app/projects/${projectId}/configs`)}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </Fragment>
  );
}
