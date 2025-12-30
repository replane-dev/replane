'use client';

import {ConfigForm, type ConfigFormSubmitData} from '@/components/config-form';
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
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import type {Override} from '@/engine/core/override-evaluator';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {formatDistanceToNow} from 'date-fns';
import {AlertTriangle, GitBranch, Info} from 'lucide-react';
import Link from 'next/link';
import {notFound, useRouter} from 'next/navigation';
import {useCallback, useState} from 'react';
import {toast} from 'sonner';

export interface ConfigDetailViewProps {
  projectId: string;
  configName: string;
  onDelete?: () => void;
  onProposalCreated?: (proposalId: string) => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function ConfigDetailView({
  projectId,
  configName,
  onDelete,
  onProposalCreated,
  onDirtyChange,
}: ConfigDetailViewProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const {data: pageData} = useSuspenseQuery(
    trpc.getConfigPageData.queryOptions({configName, projectId}),
  );
  const updateConfig = useMutation(trpc.updateConfig.mutationOptions());
  const createConfigProposal = useMutation(trpc.createConfigProposal.mutationOptions());
  const rejectAllPendingProposals = useMutation(
    trpc.rejectAllPendingConfigProposals.mutationOptions(),
  );
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

  const requireProposals = pageData.project?.requireProposals ?? false;
  const [proposalMessage, setProposalMessage] = useState('');
  const [showProposalDialog, setShowProposalDialog] = useState(false);
  const [pendingProposalData, setPendingProposalData] = useState<ConfigFormSubmitData | null>(null);
  const [showPendingWarning, setShowPendingWarning] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<ConfigFormSubmitData | null>(null);
  const [liveValue, setLiveValue] = useState<any>(null);
  const [liveOverrides, setLiveOverrides] = useState<Override[]>([]);
  const [showOverrideTester, setShowOverrideTester] = useState(false);

  const config = pageData.config;

  const defaultConfigValue = config?.config?.value ?? null;

  const onValuesChange = useCallback(
    (values: {value: string; overrides: Override[]}) => {
      setLiveOverrides(values.overrides);
      try {
        setLiveValue(JSON.parse(values.value));
      } catch {
        setLiveValue(defaultConfigValue);
      }
    },
    [defaultConfigValue],
  );

  async function executeUpdateConfig(data: ConfigFormSubmitData) {
    if (!config) return;

    await updateConfig.mutateAsync({
      projectId,
      configName,
      prevVersion: config.config.version,
      description: data.description,
      editorEmails: data.editorEmails,
      maintainerEmails: data.maintainerEmails,
      defaultVariant: data.defaultVariant,
      environmentVariants: data.environmentVariants.map(v => ({
        environmentId: v.environmentId,
        value: v.value,
        schema: v.schema,
        overrides: v.overrides,
        useBaseSchema: v.useBaseSchema,
      })),
    });

    toast.success('Config updated successfully');
  }

  if (!config) {
    notFound();
  }

  async function handleSave(data: ConfigFormSubmitData) {
    if (!config) {
      throw new Error('unreachable: we do not render form when config is undefined');
    }

    if (config.pendingConfigProposals.length > 0) {
      setPendingEditData(data);
      setShowPendingWarning(true);
      return;
    }

    await executeUpdateConfig(data);
  }

  async function handlePropose(data: ConfigFormSubmitData) {
    if (!config) {
      throw new Error('unreachable: we do not render form when config is undefined');
    }

    setPendingProposalData(data);
    setShowProposalDialog(true);
  }

  async function confirmEdit() {
    if (!pendingEditData) return;

    setShowPendingWarning(false);
    setPendingEditData(null);
    await executeUpdateConfig(pendingEditData);
  }

  return (
    <div className="space-y-6">
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
                      <span>By {config.pendingConfigProposals[0]!.authorEmail ?? 'Unknown'}</span>
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
                                projectId,
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
                          ? `/app/projects/${projectId}/configs/${encodeURIComponent(configName)}/proposals/${config.pendingConfigProposals[0]!.id}`
                          : `/app/projects/${projectId}/configs/${encodeURIComponent(configName)}/proposals`
                      }
                    >
                      {config.pendingConfigProposals.length === 1 ? 'Review proposal' : 'View all'}
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfigForm
        onValuesChange={onValuesChange}
        mode="edit"
        role={config.myRole}
        currentName={configName}
        currentPendingProposalsCount={config.pendingConfigProposals.length}
        environments={pageData.environments}
        requireProposals={requireProposals}
        defaultVariant={{
          value: config.config.value,
          schema: config.config.schema,
          overrides: config.config.overrides as Override[],
        }}
        environmentVariants={config.variants.map(v => ({
          configVariantId: v.id,
          environmentId: v.environmentId,
          value: v.value,
          schema: v.schema,
          overrides: v.overrides as Override[],
          useBaseSchema: v.useBaseSchema,
        }))}
        defaultDescription={config.config?.description ?? ''}
        defaultMaintainerEmails={config.maintainerEmails}
        defaultEditorEmails={config.editorEmails}
        editorIdPrefix={`edit-config-${configName}`}
        createdAt={config.config.createdAt}
        updatedAt={config.config.updatedAt}
        currentVersion={config.config.version}
        versionsLink={`/app/projects/${projectId}/configs/${encodeURIComponent(configName)}/versions`}
        submitting={updateConfig.isPending || createConfigProposal.isPending}
        onDelete={onDelete}
        onSave={handleSave}
        onPropose={handlePropose}
        onTestOverrides={() => {
          setShowOverrideTester(true);
        }}
        projectUsers={pageData.projectUsers}
        onDirtyChange={onDirtyChange}
      />

      {showOverrideTester && (
        <OverrideTester
          baseValue={liveValue || config.config.value || {}}
          overrides={liveOverrides || (config.config.overrides as any) || []}
          open={showOverrideTester}
          onOpenChange={setShowOverrideTester}
        />
      )}

      <Dialog open={showProposalDialog} onOpenChange={setShowProposalDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Create Proposal</DialogTitle>
          </DialogHeader>

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
                      href={`/app/projects/${projectId}/configs/${encodeURIComponent(configName)}/proposals`}
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
                  const res = await createConfigProposal.mutateAsync({
                    projectId: projectId,
                    configId: config.config.id,
                    baseVersion: config.config.version,
                    proposedDelete: false,
                    description: pendingProposalData.description,
                    editorEmails: pendingProposalData.editorEmails,
                    maintainerEmails: pendingProposalData.maintainerEmails,
                    defaultVariant: pendingProposalData.defaultVariant,
                    environmentVariants: pendingProposalData.environmentVariants,
                    message: proposalMessage.trim() || null,
                  });

                  setShowProposalDialog(false);
                  setProposalMessage('');
                  setPendingProposalData(null);

                  if (onProposalCreated) {
                    onProposalCreated(res.configProposalId);
                  } else {
                    router.push(
                      `/app/projects/${projectId}/configs/${encodeURIComponent(configName)}/proposals/${res.configProposalId}`,
                    );
                  }
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
              {createConfigProposal.isPending ? 'Creating…' : 'Create proposal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {config && (
        <PendingProposalsWarningDialog
          open={showPendingWarning}
          onOpenChange={setShowPendingWarning}
          pendingProposals={config.pendingConfigProposals}
          configName={configName}
          projectId={projectId}
          action="edit"
          onConfirm={confirmEdit}
          isLoading={updateConfig.isPending}
        />
      )}
    </div>
  );
}
