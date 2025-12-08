'use client';

import {ConfigForm} from '@/components/config-form';
import type {Override} from '@/engine/core/override-evaluator';
import type {ConfigSchema, ConfigValue} from '@/engine/core/zod';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {useSession} from 'next-auth/react';
import {useRouter} from 'next/navigation';

export interface NewConfigViewProps {
  projectId: string;
  onSuccess?: (configName: string) => void;
  onCancel?: () => void;
}

export function NewConfigView({projectId, onSuccess, onCancel}: NewConfigViewProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const createConfig = useMutation(trpc.createConfig.mutationOptions());
  const {data: session, status} = useSession();

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
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
    };
    environmentVariants: Array<{
      environmentId: string;
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
      useDefaultSchema: boolean;
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

    if (onSuccess) {
      onSuccess(data.name);
    } else {
      router.push(`/app/projects/${projectId}/configs`);
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
    } else {
      router.push(`/app/projects/${projectId}/configs`);
    }
  }

  if (environments.length === 0) {
    return (
      <div className="rounded-lg border bg-yellow-50 dark:bg-yellow-950/30 p-6 text-center">
        <p className="text-sm font-semibold text-foreground mb-2">No environments found</p>
        <p className="text-sm text-muted-foreground">
          Please create at least one config first, or contact support if this is a new project.
        </p>
      </div>
    );
  }

  return (
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
      onCancel={handleCancel}
      onSubmit={handleSubmit}
    />
  );
}
