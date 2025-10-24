'use client';

import {ConfigProposalDiff} from '@/components/config-proposal-diff';
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
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {format, formatDistanceToNow} from 'date-fns';
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';
import {Fragment} from 'react';
import {useProject} from '../../../../utils';

export default function ReviewConfigProposalPage() {
  const router = useRouter();
  const {proposalId} = useParams<{proposalId: string}>();
  const trpc = useTRPC();
  const project = useProject();

  const {data: proposalData} = useSuspenseQuery(
    trpc.getConfigProposal.queryOptions({proposalId: proposalId!}),
  );

  const proposal = proposalData.proposal;

  const {data: configData} = useSuspenseQuery(
    trpc.getConfig.queryOptions({name: proposal.configName, projectId: project.id}),
  );
  const config = configData.config;

  const approve = useMutation(trpc.approveConfigProposal.mutationOptions());
  const reject = useMutation(trpc.rejectConfigProposal.mutationOptions());

  const createdAt = new Date(proposal.createdAt);

  const shortId = proposal.id.slice(-8);

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
          <div className="rounded-lg border bg-card/50 p-3 text-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
              <div className="sm:col-span-3">Proposal ID</div>
              <div className="sm:col-span-9 break-all">{proposal.id}</div>
              <div className="sm:col-span-3">Proposer</div>
              <div className="sm:col-span-9">{proposal.proposerEmail ?? 'Unknown'}</div>
              <div className="sm:col-span-3">Created</div>
              <div className="sm:col-span-9">
                <span title={format(createdAt, 'yyyy-MM-dd HH:mm:ss')}>
                  {formatDistanceToNow(createdAt, {addSuffix: true})}
                </span>
              </div>
              <div className="sm:col-span-3">Base version</div>
              <div className="sm:col-span-9">{proposal.baseConfigVersion}</div>
              <div className="sm:col-span-3">Status</div>
              <div className="sm:col-span-9 capitalize">{proposal.status}</div>
              {proposal.rejectedInFavorOfProposalId && (
                <>
                  <div className="sm:col-span-3">Approved instead</div>
                  <div className="sm:col-span-9">
                    <Link
                      className="underline"
                      href={`/app/projects/${project.id}/configs/${encodeURIComponent(proposal.configName)}/proposals/${proposal.rejectedInFavorOfProposalId}`}
                    >
                      View approved proposal
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Who can approve */}
          <div className="rounded-lg border bg-card/50 p-3 text-sm">
            <div className="font-medium mb-2">Who can approve</div>
            <p className="mb-2">
              {proposal.approverRole === 'owners'
                ? 'Only config owners can approve this proposal.'
                : 'Config owners and editors can approve this proposal.'}
            </p>
            <p className="mb-2 text-muted-foreground">{proposal.approverReason}</p>
            {proposal.approverEmails.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {proposal.approverEmails.map(email => (
                  <li key={email} className="break-all">
                    {email}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-muted-foreground">
                No eligible approvers found for this config.
              </div>
            )}
          </div>

          {proposal.proposedDelete ? (
            <div className="rounded-lg border bg-destructive/10 p-4 text-sm">
              <div className="font-medium mb-1">Deletion proposal</div>
              <p>
                This proposal requests to permanently delete the config
                <span className="font-semibold"> {proposal.configName}</span>. If approved, the
                config will be removed, and this action cannot be undone.
              </p>
            </div>
          ) : config ? (
            <ConfigProposalDiff
              current={{
                value: config.config.value,
                description: config.config.description,
                schema: config.config.schema,
                owners: config.ownerEmails,
                editors: config.editorEmails,
              }}
              proposed={{
                value: proposal.proposedValue,
                description: proposal.proposedDescription,
                schema: proposal.proposedSchema,
                members: proposal.proposedMembers
                  ? {
                      newMembers: proposal.proposedMembers.newMembers.map(m => ({
                        email: m.email,
                        role: m.role as 'owner' | 'editor' | 'viewer',
                      })),
                    }
                  : null,
              }}
            />
          ) : (
            <div className="rounded-lg border bg-card/50 p-3 text-sm">
              Current config not found. It may have been removed.
            </div>
          )}

          {proposal.status === 'pending' && (
            <div className="flex gap-2">
              <Button
                disabled={approve.isPending || reject.isPending}
                onClick={async () => {
                  await approve.mutateAsync({proposalId: proposal.id});

                  if (proposal.proposedDelete) {
                    router.push(`/app/projects/${project.id}/configs`);
                  } else {
                    router.push(
                      `/app/projects/${project.id}/configs/${encodeURIComponent(proposal.configName)}`,
                    );
                  }
                }}
              >
                {approve.isPending
                  ? 'Approving…'
                  : proposal.proposedDelete
                    ? 'Approve deletion'
                    : 'Approve'}
              </Button>
              <Button
                variant="destructive"
                disabled={approve.isPending || reject.isPending}
                onClick={async () => {
                  await reject.mutateAsync({proposalId: proposal.id});
                  router.push(
                    `/app/projects/${project.id}/configs/${encodeURIComponent(proposal.configName)}`,
                  );
                }}
              >
                {reject.isPending ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Fragment>
  );
}
