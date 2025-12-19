'use client';

import {ConfigForm, type ConfigFormSubmitData} from '@/components/config-form';
import {useUser} from '@/contexts/user-context';
import type {Override} from '@/engine/core/override-evaluator';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';

export interface NewConfigViewProps {
  projectId: string;
  onSuccess?: (configName: string) => void;
  onCancel?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function NewConfigView({projectId, onSuccess, onCancel, onDirtyChange}: NewConfigViewProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const createConfig = useMutation(trpc.createConfig.mutationOptions());
  const {user, isLoading} = useUser();

  // Fetch project environments and users
  const {data: pageData} = useSuspenseQuery(trpc.getNewConfigPageData.queryOptions({projectId}));

  const environments = pageData.environments;
  const projectUsers = pageData.projectUsers;

  // While session is loading, avoid asserting (email would be undefined briefly)
  if (isLoading) {
    return null; // Could render a spinner / skeleton if desired
  }

  const userEmail = user.email;
  if (!userEmail) throw new Error('User email is required');

  async function handleCreate(data: ConfigFormSubmitData) {
    await createConfig.mutateAsync({
      name: data.name,
      description: data.description ?? '',
      editorEmails: data.editorEmails,
      maintainerEmails: data.maintainerEmails,
      projectId,
      defaultVariant: data.defaultVariant,
      environmentVariants: data.environmentVariants.map(v => ({
        environmentId: v.environmentId,
        value: v.value,
        schema: v.schema,
        overrides: v.overrides as Override[],
        useDefaultSchema: v.useDefaultSchema,
      })),
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
      environments={environments}
      requireProposals={false}
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
      submitting={createConfig.isPending}
      onCancel={handleCancel}
      onCreate={handleCreate}
      projectUsers={projectUsers}
      onDirtyChange={onDirtyChange}
    />
  );
}
