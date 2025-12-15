'use client';

import {ConfigProposalDiff} from '@/components/config-proposal-diff';
import {PendingProposalsWarningDialog} from '@/components/pending-proposals-warning-dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {Button} from '@/components/ui/button';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {assertNever, isValidUuid} from '@/engine/core/utils';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {format, formatDistanceToNow} from 'date-fns';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  GitCommitVertical,
  Mail,
  MessageSquare,
  User,
  XCircle,
} from 'lucide-react';
import {useSession} from 'next-auth/react';
import Link from 'next/link';
import {notFound, useParams, useRouter} from 'next/navigation';
import {Fragment, useState} from 'react';
import {useProject} from '../../../../utils';

function formatTimezoneOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  return `UTC${sign}${hours}${minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : ''}`;
}

export default function ReviewConfigProposalPage() {
  const router = useRouter();
  const {proposalId} = useParams<{proposalId: string}>();

  // Validate UUID format before making any requests
  if (!proposalId || !isValidUuid(proposalId)) {
    notFound();
  }

  const trpc = useTRPC();
  const project = useProject();

  const {data: proposalData} = useSuspenseQuery(
    trpc.getConfigProposal.queryOptions({proposalId, projectId: project.id}),
  );

  const proposal = proposalData.proposal;
  const proposalsRejectedByThisApproval = proposalData.proposalsRejectedByThisApproval;

  // Trigger 404 page if proposal doesn't exist
  if (!proposal) {
    notFound();
  }

  // Fetch config to get other pending proposals
  const {data: configData} = useSuspenseQuery(
    trpc.getConfig.queryOptions({name: proposal.configName, projectId: project.id}),
  );

  // Fetch project to get allowSelfApprovals setting
  const {data: projectData} = useSuspenseQuery(trpc.getProject.queryOptions({id: project.id}));

  const approve = useMutation(trpc.approveConfigProposal.mutationOptions());
  const reject = useMutation(trpc.rejectConfigProposal.mutationOptions());

  const createdAt = new Date(proposal.createdAt);

  const shortId = proposal.id.slice(-8);

  const {data: session} = useSession();
  const sessionUser = session?.user;

  const allowSelfApprovals = projectData.project?.allowSelfApprovals ?? false;
  const isSelfApprovalDisabled = !allowSelfApprovals && proposal.authorEmail === sessionUser?.email;

  const [showAllApprovers, setShowAllApprovers] = useState(false);
  const [showApproveWarning, setShowApproveWarning] = useState(false);

  // Get other pending proposals (excluding current one)
  const otherPendingProposals =
    configData?.config?.pendingConfigProposals.filter(p => p.id !== proposal.id) ?? [];

  async function handleApprove() {
    await approve.mutateAsync({proposalId: proposal.id, projectId: project.id});

    if (proposal.proposedDelete) {
      router.push(`/app/projects/${project.id}/configs`);
    } else {
      router.push(`/app/projects/${project.id}/configs/${encodeURIComponent(proposal.configName)}`);
    }
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
                  <Link href={`/app/projects/${project.id}/configs`}>Configs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link
                    href={`/app/projects/${project.id}/configs/${encodeURIComponent(proposal.configName)}`}
                  >
                    {proposal.configName}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link
                    href={`/app/projects/${project.id}/configs/${encodeURIComponent(proposal.configName)}/proposals`}
                  >
                    Proposals
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{shortId}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-4xl space-y-6">
          <div className="rounded-lg border bg-card/50 p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                  {proposal.status === 'approved' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : proposal.status === 'rejected' ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Clock3 className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  )}
                </div>
                <span className="text-sm font-semibold capitalize">{proposal.status}</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Author</div>
                    <div className="text-sm font-medium">{proposal.authorEmail ?? 'Unknown'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Created</div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm font-medium cursor-help">
                          {formatDistanceToNow(createdAt, {addSuffix: true})}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <span>
                          {format(createdAt, 'yyyy-MM-dd HH:mm:ss')}{' '}
                          {formatTimezoneOffset(createdAt)}
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                    <GitCommitVertical className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Base version</div>
                    <div className="text-sm font-medium">{proposal.baseConfigVersion}</div>
                  </div>
                </div>

                {proposal.reviewerEmail && proposal.status === 'rejected' && (
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5">Rejected by</div>
                      <div className="text-sm font-medium">{proposal.reviewerEmail}</div>
                    </div>
                  </div>
                )}

                {proposal.reviewerEmail && proposal.status === 'approved' && (
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5">Approved by</div>
                      <div className="text-sm font-medium">{proposal.reviewerEmail}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Proposal Message */}
          <div className="rounded-lg border bg-card/50 p-4">
            <div className="flex items-start gap-3">
              <MessageSquare className="size-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground mb-2">
                  Proposal description
                </div>
                {proposal.message ? (
                  <p className="text-sm text-foreground/80 dark:text-foreground/70 whitespace-pre-wrap wrap-break-word">
                    {proposal.message}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No message was provided with this proposal.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Rejection reason */}
          {proposal.status === 'rejected' && proposal.rejectionReason && (
            <div className="rounded-lg border p-4 border-orange-200/50 bg-orange-50/50 dark:border-orange-900/30 dark:bg-orange-950/20">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-orange-100 dark:bg-orange-900/50">
                  <XCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground mb-2">
                    {(() => {
                      const reason = proposal.rejectionReason;
                      if (reason === 'another_proposal_approved') {
                        return 'Another proposal was approved';
                      } else if (reason === 'config_deleted') {
                        return 'Config was deleted';
                      } else if (reason === 'config_edited') {
                        return 'Config was edited directly';
                      } else if (reason === 'rejected_explicitly') {
                        return 'Rejected by reviewer';
                      } else {
                        assertNever(reason, 'Unhandled rejection reason');
                      }
                    })()}
                  </div>
                  <p className="text-sm text-foreground/80 dark:text-foreground/70 mb-2">
                    {(() => {
                      const reason = proposal.rejectionReason;
                      if (reason === 'another_proposal_approved') {
                        return 'This proposal was automatically rejected because a different proposal was approved and applied to the config. Only one proposal can be applied at a time.';
                      } else if (reason === 'config_deleted') {
                        return 'This proposal was automatically rejected because the config was deleted. Pending proposals are rejected when their target config is removed.';
                      } else if (reason === 'config_edited') {
                        return 'This proposal was automatically rejected because the config was edited directly, making this proposal outdated. Proposals must be based on the current config version.';
                      } else if (reason === 'rejected_explicitly') {
                        return 'This proposal was rejected by a reviewer and will not be applied to the config.';
                      } else {
                        assertNever(reason, 'Unhandled rejection reason');
                      }
                    })()}
                  </p>
                  {proposal.rejectionReason !== 'config_deleted' && (
                    <p className="text-sm text-foreground/70 dark:text-foreground/60 italic">
                      {proposal.rejectionReason === 'rejected_explicitly' ? (
                        <>
                          Consider discussing the feedback with{' '}
                          {proposal.reviewerEmail ? proposal.reviewerEmail : 'the reviewer'} before
                          creating a new proposal.
                        </>
                      ) : (
                        <>
                          You can create a new proposal based on the current config version if
                          you&apos;d like to propose similar changes.
                        </>
                      )}
                    </p>
                  )}
                  {proposal.rejectionReason === 'another_proposal_approved' &&
                    proposal.rejectedInFavorOfProposalId && (
                      <Link
                        href={`/app/projects/${project.id}/configs/${encodeURIComponent(proposal.configName)}/proposals/${proposal.rejectedInFavorOfProposalId}`}
                        className="inline-flex items-center gap-2 text-sm font-medium underline"
                      >
                        <span>View the approved proposal</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Proposals rejected due to this approval */}
          {proposal.status === 'approved' && proposalsRejectedByThisApproval.length > 0 && (
            <div className="rounded-lg border border-green-200/50 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20 p-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-green-100 dark:bg-green-900/50">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground mb-2">
                    {proposalsRejectedByThisApproval.length === 1
                      ? 'One proposal was automatically rejected'
                      : `${proposalsRejectedByThisApproval.length} proposals were automatically rejected`}
                  </div>
                  <p className="text-sm text-foreground/80 dark:text-foreground/70 mb-3">
                    When this proposal was approved, other pending proposals for the same config
                    were automatically rejected. Only one proposal can be applied at a time.
                  </p>
                  <div className="space-y-2 mb-3">
                    {proposalsRejectedByThisApproval.map(
                      (rejectedProposal: {id: string; authorEmail: string | null}) => {
                        const rejectedShortId = rejectedProposal.id.slice(-8);
                        return (
                          <Link
                            key={rejectedProposal.id}
                            href={`/app/projects/${project.id}/configs/${encodeURIComponent(proposal.configName)}/proposals/${rejectedProposal.id}`}
                            className="flex items-center gap-2.5 rounded-md border bg-background/50 px-3 py-2 hover:bg-background/80 transition-colors"
                          >
                            <GitCommitVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground">
                              Proposal {rejectedShortId}
                            </span>
                            {rejectedProposal.authorEmail && (
                              <>
                                <span className="text-sm text-muted-foreground">·</span>
                                <span className="text-sm text-muted-foreground">
                                  by {rejectedProposal.authorEmail}
                                </span>
                              </>
                            )}
                            <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
                          </Link>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Config updated - no other proposals rejected */}
          {proposal.status === 'approved' && proposalsRejectedByThisApproval.length === 0 && (
            <div className="rounded-lg border border-green-200/50 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20 p-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-green-100 dark:bg-green-900/50">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground mb-2">
                    Config updated successfully
                  </div>
                  <p className="text-sm text-foreground/80 dark:text-foreground/70 mb-3">
                    This proposal was approved and the changes have been applied to the config.
                    There were no other pending proposals at the time of approval.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Who can approve - only show for pending proposals */}
          {proposal.status === 'pending' && (
            <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-4">
              <div className="flex items-start gap-3">
                <User className="size-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">
                      Who can approve
                    </div>
                    <p className="text-sm text-foreground/80 dark:text-foreground/70 mb-2">
                      {proposal.approverRole === 'maintainers'
                        ? 'Only config maintainers can approve this proposal.'
                        : 'Config maintainers and editors can approve this proposal.'}
                    </p>
                    <p className="text-sm text-foreground/70 dark:text-foreground/60 mb-4">
                      {proposal.approverReason}
                    </p>
                    {proposal.approverEmails.length > 0 ? (
                      <>
                        <div className="space-y-2">
                          {(showAllApprovers
                            ? proposal.approverEmails
                            : proposal.approverEmails.slice(0, 3)
                          ).map(email => (
                            <div
                              key={email}
                              className="flex items-center gap-2.5 rounded-md border bg-background/50 px-3 py-2"
                            >
                              <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-foreground break-all">
                                {email}
                              </span>
                            </div>
                          ))}
                        </div>
                        {proposal.approverEmails.length > 3 && (
                          <button
                            onClick={() => setShowAllApprovers(!showAllApprovers)}
                            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                          >
                            {showAllApprovers ? (
                              <>
                                <ChevronUp className="h-4 w-4" />
                                <span>Show less</span>
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-4 w-4" />
                                <span>Show {proposal.approverEmails.length - 3} more</span>
                              </>
                            )}
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="rounded-md border border-dashed bg-background/30 p-3 text-center">
                        <p className="text-sm text-muted-foreground">
                          No eligible approvers found for this config.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {proposal.proposedDelete ? (
            <div className="rounded-lg border bg-destructive/10 p-4 text-sm">
              <div className="font-medium mb-1">Deletion proposal</div>
              <p>
                This proposal requests to permanently delete the config
                <span className="font-semibold"> {proposal.configName}</span>. If approved, the
                config will be removed, and this action cannot be undone.
              </p>
            </div>
          ) : (
            <ConfigProposalDiff
              current={{
                description: proposal.base.description,
                maintainers: proposal.base.members
                  .filter(m => m.role === 'maintainer')
                  .map(m => m.email),
                editors: proposal.base.members.filter(m => m.role === 'editor').map(m => m.email),
              }}
              proposed={{
                description: proposal.proposed.description,
                members: proposal.proposed.members,
              }}
              proposedDefaultVariant={{
                proposedValue: proposal.proposed.value,
                proposedSchema: proposal.proposed.schema,
                proposedOverrides: proposal.proposed.overrides,
                originalValue: proposal.base.value,
                originalSchema: proposal.base.schema,
                originalOverrides: proposal.base.overrides,
              }}
              proposedVariants={proposal.proposed.variants.map(v => {
                const baseVariant = proposal.base.variants.find(
                  bv => bv.environmentId === v.environmentId,
                );
                return {
                  environmentId: v.environmentId,
                  environmentName: v.environmentName,
                  proposedValue: v.value,
                  proposedSchema: v.schema,
                  proposedOverrides: v.overrides,
                  useDefaultSchema: false,
                  currentValue: baseVariant?.value ?? proposal.base.value,
                  currentSchema: baseVariant?.schema ?? null,
                  currentOverrides: baseVariant?.overrides ?? [],
                  currentUseDefaultSchema: false,
                };
              })}
            />
          )}

          {/* Spacer to prevent content from being hidden behind sticky buttons */}
          {proposal.status === 'pending' && <div className="h-20" />}
        </div>

        {/* Sticky button panel */}
        {proposal.status === 'pending' && (
          <div className="sticky bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 py-3 px-4">
            <div className="max-w-4xl flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      disabled={approve.isPending || reject.isPending || isSelfApprovalDisabled}
                      onClick={async () => {
                        // Show warning if there are other pending proposals
                        if (otherPendingProposals.length > 0) {
                          setShowApproveWarning(true);
                          return;
                        }

                        await handleApprove();
                      }}
                    >
                      {approve.isPending
                        ? 'Approving…'
                        : proposal.proposedDelete
                          ? 'Approve deletion'
                          : 'Approve'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {isSelfApprovalDisabled && (
                  <TooltipContent>
                    <p>You cannot approve your own proposal.</p>
                  </TooltipContent>
                )}
              </Tooltip>
              <Button
                variant="destructive"
                disabled={approve.isPending || reject.isPending}
                onClick={async () => {
                  await reject.mutateAsync({proposalId: proposal.id, projectId: project.id});
                  router.push(
                    `/app/projects/${project.id}/configs/${encodeURIComponent(proposal.configName)}`,
                  );
                }}
              >
                {reject.isPending ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
          </div>
        )}

        {/* Pending Proposals Warning for Approval */}
        <PendingProposalsWarningDialog
          open={showApproveWarning}
          onOpenChange={setShowApproveWarning}
          pendingProposals={otherPendingProposals}
          configName={proposal.configName}
          projectId={project.id}
          action="approve"
          onConfirm={async () => {
            setShowApproveWarning(false);
            await handleApprove();
          }}
          isLoading={approve.isPending}
        />
      </div>
    </Fragment>
  );
}
