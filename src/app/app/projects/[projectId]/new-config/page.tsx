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
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
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

  // Fetch project environments
  const {data: environmentsData} = useSuspenseQuery(
    trpc.getProjectEnvironments.queryOptions({projectId}),
  );

  const environments = environmentsData.environments;

  // While session is loading, avoid asserting (email would be undefined briefly)
  if (status === 'loading') {
    return null; // Could render a spinner / skeleton if desired
  }

  const userEmail = session?.user?.email;
  if (!userEmail) throw new Error('User email is required');

  async function handleSubmit(data: {
    name: string;
    defaultVariant?: {
      value: unknown;
      schema: unknown | null;
      overrides: Override[];
    };
    environmentVariants: Array<{
      environmentId: string;
      value: unknown;
      schema: unknown | null;
      overrides: Override[];
    }>;
    description: string;
    maintainerEmails: string[];
    editorEmails: string[];
  }) {
    await createConfig.mutateAsync({
      name: data.name,
      description: data.description ?? '',
      editorEmails: data.editorEmails,
      maintainerEmails: data.maintainerEmails,
      projectId,
      defaultVariant: data.defaultVariant,
      environmentVariants: data.environmentVariants,
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
          {environments.length === 0 ? (
            <div className="rounded-lg border bg-yellow-50 dark:bg-yellow-950/30 p-6 text-center">
              <p className="text-sm font-semibold text-foreground mb-2">No environments found</p>
              <p className="text-sm text-muted-foreground">
                Please create at least one config first, or contact support if this is a new
                project.
              </p>
            </div>
          ) : (
            <ConfigForm
              mode="new"
              role="maintainer"
              environments={environments.map(env => ({
                id: env.id,
                name: env.name,
              }))}
              defaultVariant={{
                value: null,
                schema: null,
                overrides: [],
              }}
              environmentVariants={[]}
              defaultMaintainerEmails={[userEmail!]}
              defaultEditorEmails={[]}
              defaultDescription={''}
              editorIdPrefix="new-config"
              saving={createConfig.isPending}
              onCancel={() => router.push(`/app/projects/${projectId}/configs`)}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>
    </Fragment>
  );
}
