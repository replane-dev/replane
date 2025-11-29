'use client';

import {ConfigForm} from '@/components/config-form';
import {OverrideTester} from '@/components/override-tester';
import {PendingProposalsWarningDialog} from '@/components/pending-proposals-warning-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Label} from '@/components/ui/label';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {Textarea} from '@/components/ui/textarea';
import type {ConfigUserRole} from '@/engine/core/db';
import type {Override} from '@/engine/core/override-evaluator';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {formatDistanceToNow} from 'date-fns';
import {AlertTriangle, GitBranch, Info} from 'lucide-react';
import Link from 'next/link';
import {notFound, useParams, useRouter, useSearchParams} from 'next/navigation';
import {Fragment, useCallback, useState} from 'react';
import {toast} from 'sonner';
import {useProject, useProjectId} from '../../utils';
import {useDeleteOrProposeConfig} from '../useDeleteOrPropose';

// No props needed in a Client Component; use useParams() instead.

export default function ConfigByNamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {name: nameParam} = useParams<{name: string}>();
  const name = decodeURIComponent(nameParam ?? '');
  const trpc = useTRPC();
  const projectId = useProjectId();
  const {data} = useSuspenseQuery(trpc.getConfig.queryOptions({name, projectId}));
  const {data: projectData} = useSuspenseQuery(trpc.getProject.queryOptions({id: projectId}));
  const patchConfig = useMutation(trpc.patchConfig.mutationOptions());
  const createConfigProposal = useMutation(trpc.createConfigProposal.mutationOptions());
  const rejectAllPendingProposals = useMutation(
    trpc.rejectAllPendingConfigProposals.mutationOptions(),
  );
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

  const project = useProject();
  const requireProposals = projectData.project?.requireProposals ?? false;
  const allowSelfApprovals = projectData.project?.allowSelfApprovals ?? false;
  const deleteOrPropose = useDeleteOrProposeConfig();
  const [proposalMessage, setProposalMessage] = useState('');
  const [showProposalDialog, setShowProposalDialog] = useState(false);
  const [pendingProposalData, setPendingProposalData] = useState<any>(null);
  const [showPendingWarning, setShowPendingWarning] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<any>(null);
  const [liveValue, setLiveValue] = useState<any>(null);
  const [liveOverrides, setLiveOverrides] = useState<any>(null);
  const [showOverrideTester, setShowOverrideTester] = useState(false);
  const [activeTestEnvironmentId, setActiveTestEnvironmentId] = useState<string | null>(null);

  const config = data.config;

  // Get initial environment from URL query param
  const envIdFromUrl = searchParams.get('env_id');
  const initialEnvironmentId =
    envIdFromUrl && config?.variants.some(v => v.environmentId === envIdFromUrl)
      ? envIdFromUrl
      : undefined;

  // Handler for when environment tab changes
  const handleEnvironmentChange = useCallback(
    (environmentId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('env_id', environmentId);
      router.replace(`?${params.toString()}`, {scroll: false});
    },
    [router, searchParams],
  );

  const onValuesChange = useCallback(
    (environmentId: string, values: {value: string; overrides: Override[]}) => {
      // Only update if this is the environment we're currently testing
      if (activeTestEnvironmentId === environmentId) {
        setLiveOverrides(values.overrides);
        try {
          setLiveValue(JSON.parse(values.value));
        } catch {
          const variant = config?.variants.find(v => v.environmentId === environmentId);
          setLiveValue(variant?.value);
        }
      }
    },
    [activeTestEnvironmentId, config?.variants],
  );

  async function executePatchConfig(data: {
    variants: Array<{
      configVariantId?: string;
      environmentId: string;
      value: unknown;
      schema: unknown | null;
      overrides: Override[];
      version?: number;
    }>;
    description: string;
    maintainerEmails: string[];
    editorEmails: string[];
  }) {
    if (!config) return;

    // Build variant changes array
    const variantChanges = [];
    for (const variantData of data.variants) {
      const originalVariant = config.variants.find(v => v.id === variantData.configVariantId);
      if (!originalVariant) continue;

      // Check if this variant has changes
      const valueChanged =
        JSON.stringify(variantData.value) !== JSON.stringify(originalVariant.value);
      const schemaChanged =
        JSON.stringify(variantData.schema) !== JSON.stringify(originalVariant.schema);
      const overridesChanged =
        JSON.stringify(variantData.overrides) !== JSON.stringify(originalVariant.overrides);

      if (valueChanged || schemaChanged || overridesChanged) {
        variantChanges.push({
          configVariantId: originalVariant.id,
          prevVersion: originalVariant.version,
          value: valueChanged ? {newValue: variantData.value} : undefined,
          schema:
            config.myRole === 'maintainer' && schemaChanged
              ? {newSchema: variantData.schema}
              : undefined,
          overrides:
            config.myRole === 'maintainer' && overridesChanged
              ? {newOverrides: variantData.overrides}
              : undefined,
        });
      }
    }

    // Check config-level changes (description, members)
    const current = config.config;
    const descChanged = (data.description ?? '') !== (current.description ?? '');
    const currentMaintainers = (config.maintainerEmails ?? []).slice().sort();
    const currentEditors = (config.editorEmails ?? []).slice().sort();
    const newMaintainers = (data.maintainerEmails ?? []).slice().sort();
    const newEditors = (data.editorEmails ?? []).slice().sort();
    const maintainersChanged =
      JSON.stringify(currentMaintainers) !== JSON.stringify(newMaintainers);
    const editorsChanged = JSON.stringify(currentEditors) !== JSON.stringify(newEditors);

    // Call unified patchConfig with both config and variant changes
    await patchConfig.mutateAsync({
      configId: config.config.id,
      prevVersion: config.config.version,
      description: descChanged ? {newDescription: data.description} : undefined,
      members:
        config.myRole === 'maintainer' && (maintainersChanged || editorsChanged)
          ? {
              newMembers: [
                ...data.maintainerEmails.map(email => ({
                  email,
                  role: 'maintainer' as ConfigUserRole,
                })),
                ...data.editorEmails.map(email => ({email, role: 'editor' as ConfigUserRole})),
              ],
            }
          : undefined,
      variants: variantChanges.length > 0 ? variantChanges : undefined,
    });

    toast.success('Config updated successfully');
  }

  if (!config) {
    notFound();
  }

  async function handleSubmit(data: {
    action: 'save' | 'propose';
    name: string;
    variants: Array<{
      configVariantId?: string;
      environmentId: string;
      value: unknown;
      schema: unknown | null;
      overrides: Override[];
      version?: number;
    }>;
    description: string;
    maintainerEmails: string[];
    editorEmails: string[];
  }) {
    if (!config) {
      throw new Error('unreachable: we do not render form when config is undefined');
    }

    if (data.action === 'propose') {
      // Detect config-level changes (description, members)
      const current = config.config;
      const descChanged = (data.description ?? '') !== (current.description ?? '');
      const currentMaintainers = (config.maintainerEmails ?? []).slice().sort();
      const currentEditors = (config.editorEmails ?? []).slice().sort();
      const newMaintainers = (data.maintainerEmails ?? []).slice().sort();
      const newEditors = (data.editorEmails ?? []).slice().sort();
      const maintainersChanged =
        JSON.stringify(currentMaintainers) !== JSON.stringify(newMaintainers);
      const editorsChanged = JSON.stringify(currentEditors) !== JSON.stringify(newEditors);

      const proposedDescription = descChanged ? {newDescription: data.description} : undefined;
      const proposedMembers =
        maintainersChanged || editorsChanged
          ? {
              newMembers: [
                ...newMaintainers.map(email => ({email, role: 'maintainer' as ConfigUserRole})),
                ...newEditors.map(email => ({email, role: 'editor' as ConfigUserRole})),
              ],
            }
          : undefined;

      // Collect variant-level changes
      const proposedVariants = [];
      for (const variantData of data.variants) {
        const originalVariant = config.variants.find(v => v.id === variantData.configVariantId);
        if (!originalVariant) continue;

        const valueChanged =
          JSON.stringify(variantData.value) !== JSON.stringify(originalVariant.value);
        const schemaChanged =
          JSON.stringify(variantData.schema) !== JSON.stringify(originalVariant.schema);
        const overridesChanged =
          JSON.stringify(variantData.overrides) !== JSON.stringify(originalVariant.overrides);

        if (valueChanged || schemaChanged || overridesChanged) {
          proposedVariants.push({
            configVariantId: originalVariant.id,
            baseVariantVersion: originalVariant.version,
            proposedValue: valueChanged ? {newValue: variantData.value} : undefined,
            proposedSchema: schemaChanged ? {newSchema: variantData.schema} : undefined,
            proposedOverrides: overridesChanged ? {newOverrides: variantData.overrides} : undefined,
          });
        }
      }

      // Check if anything changed
      if (proposedVariants.length === 0 && !proposedDescription && !proposedMembers) {
        alert('No changes to propose.');
        return;
      }

      // Store the proposal data and show dialog
      setPendingProposalData({
        configId: current.id,
        proposedDescription,
        proposedMembers,
        proposedVariants: proposedVariants.length > 0 ? proposedVariants : undefined,
      });
      setShowProposalDialog(true);
      return;
    }

    // Direct patch path (no approvals required)
    // Check if there are pending proposals
    if (config.pendingConfigProposals.length > 0) {
      setPendingEditData(data);
      setShowPendingWarning(true);
      return;
    }

    await executePatchConfig(data);
  }

  async function confirmEdit() {
    if (!pendingEditData) return;

    setShowPendingWarning(false);
    setPendingEditData(null);
    await executePatchConfig(pendingEditData);
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
          {config.pendingConfigProposals.length > 0 && (
            <div className="rounded-lg border border-yellow-300/60 bg-yellow-50 dark:border-yellow-800/40 dark:bg-yellow-950/30 p-4">
              <div className="flex items-start gap-3">
                <GitBranch className="size-5 text-yellow-700 dark:text-yellow-300 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground mb-1">
                        {config.pendingConfigProposals.length === 1
                          ? 'Review pending proposal'
                          : `${config.pendingConfigProposals.length} pending proposals`}
                      </div>
                      {config.pendingConfigProposals.length === 1 ? (
                        <div className="text-sm text-foreground/80 dark:text-foreground/70">
                          <span>
                            By {config.pendingConfigProposals[0]!.proposerEmail ?? 'Unknown'}
                          </span>
                          <span className="mx-1">·</span>
                          <span>
                            {formatDistanceToNow(
                              new Date(config.pendingConfigProposals[0]!.createdAt),
                              {
                                addSuffix: true,
                              },
                            )}
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm text-foreground/80 dark:text-foreground/70">
                          {config.pendingConfigProposals.length} proposals waiting for review
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                          >
                            {config.pendingConfigProposals.length === 1 ? 'Reject' : 'Reject all'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reject all pending proposals?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will reject all pending proposal This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                try {
                                  await rejectAllPendingProposals.mutateAsync({
                                    configId: config.config.id,
                                  });
                                  setIsRejectDialogOpen(false);
                                  router.refresh();
                                } catch (error) {
                                  console.error('Failed to reject all proposals:', error);
                                }
                              }}
                              disabled={rejectAllPendingProposals.isPending}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              {rejectAllPendingProposals.isPending
                                ? 'Rejecting...'
                                : config.pendingConfigProposals.length === 1
                                  ? 'Reject'
                                  : 'Reject all'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button asChild size="sm" variant="default">
                        <Link
                          href={
                            config.pendingConfigProposals.length === 1
                              ? `/app/projects/${project.id}/configs/${encodeURIComponent(name)}/proposals/${config.pendingConfigProposals[0]!.id}`
                              : `/app/projects/${project.id}/configs/${encodeURIComponent(name)}/proposals`
                          }
                        >
                          {config.pendingConfigProposals.length === 1
                            ? 'Review proposal'
                            : 'View all'}
                        </Link>
                      </Button>
                    </div>
                  </div>
                  {config.pendingConfigProposals.length > 1 && (
                    <ul className="mt-3 space-y-4 border-t border-yellow-300/40 dark:border-yellow-800/30 pt-3">
                      {config.pendingConfigProposals.map(p => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between text-sm text-foreground/80 dark:text-foreground/70"
                        >
                          <div className="flex flex-col">
                            <span>By {p.proposerEmail ?? 'Unknown'}</span>
                            <span className="text-xs text-foreground/60 dark:text-foreground/50">
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
                  )}
                </div>
              </div>
            </div>
          )}

          <ConfigForm
            onValuesChange={onValuesChange}
            mode={requireProposals || config.myRole === 'viewer' ? 'proposal' : 'edit'}
            role={requireProposals || config.myRole === 'viewer' ? 'maintainer' : config.myRole}
            currentName={name}
            currentPendingProposalsCount={config.pendingConfigProposals.length}
            variants={config.variants.map(v => ({
              configVariantId: v.id,
              environmentId: v.environmentId,
              environmentName: v.environmentName,
              value: v.value,
              schema: v.schema,
              overrides: v.overrides as Override[],
              version: v.version,
            }))}
            initialEnvironmentId={initialEnvironmentId}
            onEnvironmentChange={handleEnvironmentChange}
            defaultDescription={config.config?.description ?? ''}
            defaultMaintainerEmails={config.maintainerEmails}
            defaultEditorEmails={config.editorEmails}
            editorIdPrefix={`edit-config-${name}`}
            createdAt={config.config.createdAt}
            updatedAt={config.config.updatedAt}
            currentVersion={config.config.version}
            versionsLink={`/app/projects/${project.id}/configs/${encodeURIComponent(name)}/versions`}
            saving={patchConfig.isPending}
            proposing={createConfigProposal.isPending}
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
            onTestOverrides={environmentId => {
              setActiveTestEnvironmentId(environmentId);
              setShowOverrideTester(true);
            }}
          />

          {/* Override Tester Dialog */}
          {activeTestEnvironmentId && (
            <OverrideTester
              baseValue={
                liveValue ||
                config.variants.find(v => v.environmentId === activeTestEnvironmentId)?.value
              }
              overrides={
                liveOverrides ||
                (config.variants.find(v => v.environmentId === activeTestEnvironmentId)
                  ?.overrides as any)
              }
              open={showOverrideTester}
              onOpenChange={setShowOverrideTester}
            />
          )}
        </div>

        {/* Proposal Message Dialog */}
        <Dialog open={showProposalDialog} onOpenChange={setShowProposalDialog}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Create Proposal</DialogTitle>
            </DialogHeader>

            {/* Warning/Info about proposal rejection */}
            <div className="pt-2">
              {config && config.pendingConfigProposals.length > 0 ? (
                <div className="rounded-lg border border-yellow-200/50 bg-yellow-50/50 dark:border-yellow-900/30 dark:bg-yellow-950/20 p-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                    <div className="flex-1 text-sm space-y-2">
                      <div>
                        <p className="font-semibold text-foreground">
                          {config.pendingConfigProposals.length === 1
                            ? '1 other proposal is pending'
                            : `${config.pendingConfigProposals.length} other proposals are pending`}
                        </p>
                        <p className="text-foreground/80 dark:text-foreground/70 mt-1">
                          If another proposal gets approved before this one, your proposal will be
                          automatically rejected since only one proposal can be applied at a time.
                        </p>
                      </div>
                      <Link
                        href={`/app/projects/${project.id}/configs/${encodeURIComponent(name)}/proposals`}
                        className="inline-flex items-center text-sm font-medium text-yellow-700 dark:text-yellow-300 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View pending proposals →
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-3">
                  <div className="flex items-start gap-2.5">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                    <div className="flex-1 text-sm space-y-2">
                      <p className="text-foreground/80 dark:text-foreground/70">
                        This proposal will be automatically rejected if{' '}
                        {requireProposals
                          ? 'another proposal gets approved'
                          : 'another proposal gets approved or the config is edited directly'}
                        . Only one change can be applied to a config at a time.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="proposal-message">
                  Message <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="proposal-message"
                  value={proposalMessage}
                  onChange={e => setProposalMessage(e.target.value)}
                  placeholder="Describe the changes you're proposing and why they're needed..."
                  className="min-h-[120px]"
                  maxLength={5000}
                />
                <p className="text-xs text-muted-foreground">
                  {proposalMessage.length}/5000 characters
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowProposalDialog(false);
                  setProposalMessage('');
                  setPendingProposalData(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={createConfigProposal.isPending}
                onClick={async () => {
                  if (!pendingProposalData) return;

                  try {
                    // Create unified proposal with both config and variant changes
                    const res = await createConfigProposal.mutateAsync({
                      configId: pendingProposalData.configId,
                      baseVersion: config.config.version,
                      proposedDescription: pendingProposalData.proposedDescription,
                      proposedMembers: pendingProposalData.proposedMembers,
                      proposedVariants: pendingProposalData.proposedVariants,
                      message: proposalMessage.trim() || undefined,
                    });

                    setShowProposalDialog(false);
                    setProposalMessage('');
                    setPendingProposalData(null);

                    router.push(
                      `/app/projects/${project.id}/configs/${encodeURIComponent(name)}/proposals/${res.configProposalId}`,
                    );
                  } catch (error: any) {
                    if (
                      error?.data?.cause?.code === 'CONFIG_VERSION_MISMATCH' ||
                      error?.data?.cause?.code === 'CONFIG_VARIANT_VERSION_MISMATCH'
                    ) {
                      setShowProposalDialog(false);
                      setProposalMessage('');
                      setPendingProposalData(null);
                      alert(
                        'The config was edited by another user while you were making changes. Please refresh the page to see the latest version and create a new proposal.',
                      );
                    } else {
                      throw error;
                    }
                  }
                }}
              >
                {createConfigProposal.isPending ? 'Creating…' : 'Create Proposal'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Pending Proposals Warning for Edit */}
        {config && (
          <PendingProposalsWarningDialog
            open={showPendingWarning}
            onOpenChange={setShowPendingWarning}
            pendingProposals={config.pendingConfigProposals}
            configName={name}
            projectId={projectId}
            action="edit"
            onConfirm={confirmEdit}
            isLoading={patchConfig.isPending}
          />
        )}
      </div>
    </Fragment>
  );
}
