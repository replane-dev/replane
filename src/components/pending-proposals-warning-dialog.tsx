'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {formatDistanceToNow} from 'date-fns';
import {AlertTriangle, ExternalLink} from 'lucide-react';
import Link from 'next/link';

interface PendingProposal {
  id: string;
  proposerEmail: string | null;
  createdAt: Date | string;
  baseConfigVersion: number;
}

interface PendingProposalsWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingProposals: PendingProposal[];
  configName: string;
  projectId: string;
  action: 'approve' | 'edit';
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

export function PendingProposalsWarningDialog({
  open,
  onOpenChange,
  pendingProposals,
  configName,
  projectId,
  action,
  onConfirm,
  isLoading = false,
}: PendingProposalsWarningDialogProps) {
  const actionVerb = action === 'approve' ? 'Approving' : 'Editing';
  const actionDescription =
    action === 'approve' ? 'approving this proposal' : 'editing the config directly';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[600px]">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 shrink-0">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="flex-1">
              <AlertDialogTitle>Other Proposals Will Be Rejected</AlertDialogTitle>
              <AlertDialogDescription className="mt-2 space-y-3">
                <p>
                  {actionVerb} will automatically reject{' '}
                  <span className="font-semibold">{pendingProposals.length}</span> other pending{' '}
                  {pendingProposals.length === 1 ? 'proposal' : 'proposals'}.
                </p>
                <p className="text-sm text-foreground/70 dark:text-foreground/60">
                  This happens because only one proposal can be applied to a config at a time. All
                  other proposals become outdated when you {actionDescription}.
                </p>
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {/* List of proposals to be rejected */}
        <div className="mt-4 max-h-[300px] overflow-y-auto">
          <div className="text-sm font-medium text-foreground mb-2">
            {pendingProposals.length === 1
              ? 'Proposal to be rejected:'
              : 'Proposals to be rejected:'}
          </div>
          <div className="space-y-2">
            {pendingProposals.map(proposal => (
              <Link
                key={proposal.id}
                href={`/app/projects/${projectId}/configs/${encodeURIComponent(configName)}/proposals/${proposal.id}`}
                className="block rounded-md border bg-muted/30 p-3 text-sm hover:bg-muted/50 transition-colors group"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground flex items-center gap-1.5">
                      <span>By {proposal.proposerEmail ?? 'Unknown'}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Based on version {proposal.baseConfigVersion} ·{' '}
                      {formatDistanceToNow(new Date(proposal.createdAt), {addSuffix: true})}
                    </div>
                  </div>
                  <code className="text-xs font-mono text-muted-foreground">
                    {proposal.id.slice(-8)}
                  </code>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async e => {
              e.preventDefault();
              await onConfirm();
            }}
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90"
          >
            {isLoading ? 'Processing…' : 'Continue'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
