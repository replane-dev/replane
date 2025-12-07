'use client';

import type {ConfigDetails} from '@/engine/core/use-cases/get-config-use-case';
import {useTRPC} from '@/trpc/client';
import {useMutation} from '@tanstack/react-query';
import {useCallback} from 'react';
import {useProject} from '../utils';

export function useDeleteOrProposeConfig() {
  const project = useProject();
  const requireProposals = project.requireProposals;
  const trpc = useTRPC();

  const deleteConfig = useMutation(trpc.deleteConfig.mutationOptions({}));

  const createConfigProposal = useMutation(trpc.createConfigProposal.mutationOptions({}));

  return useCallback(
    async function deleteOrPropose(params: {
      config: ConfigDetails;
      message: string | null;
      myRole: 'owner' | 'editor' | 'viewer' | string;
      prevVersion: number;
      onAfterDelete?: () => void | Promise<void>;
      onAfterPropose?: (proposalId: string) => void | Promise<void>;
    }) {
      const requireProposal = requireProposals || params.myRole !== 'owner';
      if (requireProposal) {
        const ok = confirm(
          `Create a deletion proposal for "${params.config.config.name}"? It will require approval by an owner.`,
        );
        if (!ok) return;
        const res = await createConfigProposal.mutateAsync({
          configId: params.config.config.id,
          proposedDelete: true,
          baseVersion: params.prevVersion,
          projectId: project.id,
          editorEmails: params.config.editorEmails,
          maintainerEmails: params.config.maintainerEmails,
          description: params.config.config.description,
          environmentVariants: params.config.variants
            .filter(v => v.environmentId !== null)
            .map(x => {
              const envId = x.environmentId;
              if (envId === null) {
                throw new Error('Default variant should not be in environment variants');
              }
              return {
                environmentId: envId,
                value: x.value,
                schema: x.schema,
                overrides: x.overrides,
                useDefaultSchema: x.useDefaultSchema,
              };
            }),
          defaultVariant: params.config.variants.find(v => v.environmentId === null) ?? null,
          message: params.message,
        });
        const proposalId = (res as any)?.configProposalId ?? (res as any)?.proposalId ?? '';
        await params.onAfterPropose?.(proposalId);
        return;
      }

      const ok = confirm(`Delete config "${params.config.config.name}"? This cannot be undone.`);
      if (!ok) return;
      if (params.prevVersion == null) {
        alert(
          'Unable to determine current version from the list. Open the config details to delete directly, or create a deletion proposal instead.',
        );
        return;
      }
      await deleteConfig.mutateAsync({
        configId: params.config.config.id,
        prevVersion: params.prevVersion,
      });
      await params.onAfterDelete?.();
    },
    [createConfigProposal, deleteConfig, requireProposals, project.id],
  );
}
