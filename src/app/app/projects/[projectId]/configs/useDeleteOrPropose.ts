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
      myRole: 'maintainer' | 'editor' | 'viewer';
      prevVersion: number;
      onAfterDelete?: () => void | Promise<void>;
      onAfterPropose?: (proposalId: string) => void | Promise<void>;
    }) {
      const requireProposal = requireProposals || params.myRole !== 'maintainer';
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
          environmentVariants: params.config.variants.map(x => ({
            environmentId: x.environmentId,
            value: x.value,
            schema: x.schema,
            overrides: x.overrides,
            useBaseSchema: x.useBaseSchema,
          })),
          defaultVariant: {
            value: params.config.config.value,
            schema: params.config.config.schema,
            overrides: params.config.config.overrides,
          },
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
        projectId: project.id,
        configName: params.config.config.name,
        prevVersion: params.prevVersion,
      });
      await params.onAfterDelete?.();
    },
    [createConfigProposal, deleteConfig, requireProposals, project.id],
  );
}
