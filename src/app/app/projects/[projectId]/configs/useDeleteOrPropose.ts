'use client';

import {useOrg} from '@/contexts/org-context';
import {useTRPC} from '@/trpc/client';
import {useMutation} from '@tanstack/react-query';
import {useCallback} from 'react';

export function useDeleteOrProposeConfig() {
  const org = useOrg();
  const trpc = useTRPC();

  const deleteConfig = useMutation(trpc.deleteConfig.mutationOptions({}));

  const createConfigProposal = useMutation(trpc.createConfigProposal.mutationOptions({}));

  return useCallback(
    async function deleteOrPropose(params: {
      configId: string;
      configName: string;
      myRole: 'owner' | 'editor' | 'viewer' | string;
      prevVersion: number;
      onAfterDelete?: () => void | Promise<void>;
      onAfterPropose?: (proposalId: string) => void | Promise<void>;
    }) {
      const requireProposal = org.requireProposals || params.myRole !== 'owner';
      if (requireProposal) {
        const ok = confirm(
          `Create a deletion proposal for "${params.configName}"? It will require approval by an owner.`,
        );
        if (!ok) return;
        const res = await createConfigProposal.mutateAsync({
          configId: params.configId,
          proposedDelete: true,
          baseVersion: params.prevVersion,
        });
        const proposalId = (res as any)?.configProposalId ?? (res as any)?.proposalId ?? '';
        await params.onAfterPropose?.(proposalId);
        return;
      }

      const ok = confirm(`Delete config "${params.configName}"? This cannot be undone.`);
      if (!ok) return;
      if (params.prevVersion == null) {
        alert(
          'Unable to determine current version from the list. Open the config details to delete directly, or create a deletion proposal instead.',
        );
        return;
      }
      await deleteConfig.mutateAsync({
        configId: params.configId,
        prevVersion: params.prevVersion,
      });
      await params.onAfterDelete?.();
    },
    [createConfigProposal, deleteConfig, org.requireProposals],
  );
}
