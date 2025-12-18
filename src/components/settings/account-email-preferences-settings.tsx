'use client';

import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {useTRPC} from '@/trpc/client';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Loader2} from 'lucide-react';

export function AccountEmailPreferencesSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const {data: preferences, isLoading} = useQuery(trpc.getNotificationPreferences.queryOptions());
  const updatePreferences = useMutation(
    trpc.updateNotificationPreferences.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({queryKey: trpc.getNotificationPreferences.queryKey()});
      },
    }),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleToggle = (
    key: 'proposalWaitingForReview' | 'proposalApproved' | 'proposalRejected',
    value: boolean,
  ) => {
    updatePreferences.mutate({[key]: value});
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold">Email Preferences</h3>
        <p className="text-sm text-muted-foreground">
          Choose which email notifications you want to receive
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="proposal-waiting" className="text-base">
              Proposal waiting for review
            </Label>
            <p className="text-sm text-muted-foreground">
              Get notified when a new proposal needs your review
            </p>
          </div>
          <Switch
            id="proposal-waiting"
            checked={preferences?.proposalWaitingForReview ?? true}
            onCheckedChange={value => handleToggle('proposalWaitingForReview', value)}
            disabled={updatePreferences.isPending}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="proposal-approved" className="text-base">
              Proposal approved
            </Label>
            <p className="text-sm text-muted-foreground">
              Get notified when your proposal is approved
            </p>
          </div>
          <Switch
            id="proposal-approved"
            checked={preferences?.proposalApproved ?? true}
            onCheckedChange={value => handleToggle('proposalApproved', value)}
            disabled={updatePreferences.isPending}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="proposal-rejected" className="text-base">
              Proposal rejected
            </Label>
            <p className="text-sm text-muted-foreground">
              Get notified when your proposal is rejected
            </p>
          </div>
          <Switch
            id="proposal-rejected"
            checked={preferences?.proposalRejected ?? true}
            onCheckedChange={value => handleToggle('proposalRejected', value)}
            disabled={updatePreferences.isPending}
          />
        </div>
      </div>
    </div>
  );
}

