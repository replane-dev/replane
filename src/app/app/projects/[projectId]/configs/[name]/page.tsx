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
import {Button} from '@/components/ui/button';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useOrg} from '@/contexts/org-context';
import type {ConfigUserRole} from '@/engine/core/db';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {formatDistanceToNow} from 'date-fns';
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';
import {Fragment, useMemo} from 'react';
import {useProject, useProjectId} from '../../utils';
import {useDeleteOrProposeConfig} from '../useDeleteOrPropose';

// No props needed in a Client Component; use useParams() instead.

export default function ConfigByNamePage() {
  const router = useRouter();
  const {name: nameParam} = useParams<{name: string}>();
  const name = decodeURIComponent(nameParam ?? '');
  const trpc = useTRPC();
  const projectId = useProjectId();
  const {data} = useSuspenseQuery(trpc.getConfig.queryOptions({name, projectId}));
  const patchConfig = useMutation(trpc.patchConfig.mutationOptions());
  const createConfigProposal = useMutation(trpc.createConfigProposal.mutationOptions());

  const project = useProject();
  const deleteOrPropose = useDeleteOrProposeConfig();
  const org = useOrg();

  const config = data.config;

  const defaultValue = useMemo(() => {
    if (!config) return '';
    return JSON.stringify(config.config.value, null, 2);
  }, [config]);

  if (!config) {
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
                    <Link href="/app/projects">Projects</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild>
                    <Link href={`/app/projects/${project.id}`}>{project.name}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild>
                    <Link href={`/app/projects/${project.id}/configs`}>Configs</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Not found</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          Config &quot;{name}&quot; not found.
        </div>
      </Fragment>
    );
  }

  async function handleSubmit(data: {
    name: string;
    value: unknown;
    schema: unknown | null;
    description: string;
    ownerEmails: string[];
    editorEmails: string[];
  }) {
    if (!config) {
      throw new Error('unreachable: we do not render form when config is undefined');
    }

    if (org.requireProposals) {
      // Build a minimal proposal containing only changed fields
      const current = config.config;
      const valueChanged = JSON.stringify(data.value) !== JSON.stringify(current.value);
      const descChanged = (data.description ?? '') !== (current.description ?? '');
      const schemaChanged = JSON.stringify(data.schema) !== JSON.stringify(current.schema);
      // Members change detection
      const currentOwners = (config.ownerEmails ?? []).slice().sort();
      const currentEditors = (config.editorEmails ?? []).slice().sort();
      const newOwners = (data.ownerEmails ?? []).slice().sort();
      const newEditors = (data.editorEmails ?? []).slice().sort();
      const ownersChanged = JSON.stringify(currentOwners) !== JSON.stringify(newOwners);
      const editorsChanged = JSON.stringify(currentEditors) !== JSON.stringify(newEditors);

      const proposedValue = valueChanged ? {newValue: data.value} : undefined;
      const proposedDescription = descChanged ? {newDescription: data.description} : undefined;
      const proposedSchema = schemaChanged ? {newSchema: data.schema} : undefined;
      const proposedMembers =
        ownersChanged || editorsChanged
          ? {
              newMembers: [
                ...newOwners.map(email => ({email, role: 'owner' as ConfigUserRole})),
                ...newEditors.map(email => ({email, role: 'editor' as ConfigUserRole})),
              ],
            }
          : undefined;

      if (!proposedValue && !proposedDescription && !proposedSchema && !proposedMembers) {
        alert('No changes to propose.');
        return;
      }

      const res = await createConfigProposal.mutateAsync({
        configId: current.id,
        proposedValue,
        proposedDescription,
        proposedSchema,
        proposedMembers,
      });
      const proposalId = (res as any)?.configProposalId ?? (res as any)?.proposalId;
      if (proposalId) {
        router.push(
          `/app/projects/${project.id}/configs/${encodeURIComponent(name)}/proposals/${proposalId}`,
        );
      } else {
        router.push(`/app/projects/${project.id}/configs/${encodeURIComponent(name)}/proposals`);
      }
      return;
    }

    // Direct patch path (no approvals required)
    await patchConfig.mutateAsync({
      configId: config?.config.id,
      prevVersion: config?.config.version,
      value: {newValue: data.value},
      schema: config?.myRole === 'owner' ? {newSchema: data.schema} : undefined,
      description: {newDescription: data.description},
      members:
        config?.myRole === 'owner'
          ? {
              newMembers: [
                ...data.ownerEmails.map(email => ({email, role: 'owner' as ConfigUserRole})),
                ...data.editorEmails.map(email => ({email, role: 'editor' as ConfigUserRole})),
              ],
            }
          : undefined,
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
                  <Link href={`/app/projects/${project.id}/configs`}>Configs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-3xl space-y-6">
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">
              {config.pendingProposals.length > 0
                ? `${config.pendingProposals.length} pending proposal${config.pendingProposals.length > 1 ? 's' : ''}`
                : 'No pending proposals'}
            </div>
            <Button asChild variant="outline">
              <Link
                href={`/app/projects/${project.id}/configs/${encodeURIComponent(name)}/proposals`}
              >
                View proposals
              </Link>
            </Button>
            <Button asChild className="ml-auto" variant="secondary">
              <Link
                href={`/app/projects/${project.id}/configs/${encodeURIComponent(name)}/propose`}
              >
                Propose changes
              </Link>
            </Button>
          </div>

          {config.pendingProposals.length > 0 && (
            <div className="rounded-lg border bg-card/50 p-3">
              <div className="text-sm font-medium mb-2">Pending proposals</div>
              <ul className="space-y-2">
                {config.pendingProposals.map(p => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <div className="flex flex-col">
                      <span>
                        By {p.proposerEmail ?? 'Unknown'} · based on version {p.baseConfigVersion}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(p.createdAt), {addSuffix: true})}
                      </span>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/app/projects/${project.id}/configs/${encodeURIComponent(name)}/proposals/${p.id}`}
                      >
                        Review
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ConfigForm
            mode="edit"
            role={org.requireProposals || config.myRole === 'viewer' ? 'owner' : config.myRole}
            defaultName={name}
            defaultValue={defaultValue}
            defaultSchemaEnabled={!!config.config?.schema}
            defaultSchema={
              config.config?.schema ? JSON.stringify(config.config.schema, null, 2) : ''
            }
            defaultDescription={config.config?.description ?? ''}
            defaultOwnerEmails={config.ownerEmails}
            defaultEditorEmails={config.editorEmails}
            editorIdPrefix={`edit-config-${name}`}
            createdAt={config.config.createdAt}
            updatedAt={config.config.updatedAt}
            currentVersion={config.config.version}
            versionsLink={`/app/projects/${project.id}/configs/${encodeURIComponent(name)}/versions`}
            submitting={patchConfig.isPending || createConfigProposal.isPending}
            submitLabel={org.requireProposals ? 'Propose Changes' : undefined}
            submittingLabel={org.requireProposals ? 'Proposing…' : undefined}
            onCancel={() => router.push(`/app/projects/${project.id}/configs`)}
            onDelete={async () => {
              await deleteOrPropose({
                configId: config.config.id,
                configName: name,
                myRole: config.myRole as any,
                prevVersion: config.config.version,
                onAfterDelete: () => router.push(`/app/projects/${project.id}/configs`),
                onAfterPropose: proposalId =>
                  router.push(
                    `/app/projects/${project.id}/configs/${encodeURIComponent(name)}/proposals/${proposalId}`,
                  ),
              });
            }}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </Fragment>
  );
}
