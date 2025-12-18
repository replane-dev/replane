'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {ArrowDown, ArrowUp, Globe, Info, Lock, Pencil, Plus, Trash2} from 'lucide-react';
import Link from 'next/link';
import {Fragment, useState} from 'react';
import {toast} from 'sonner';
import {useProject} from '../../utils';

export default function EnvironmentsSettingsPage() {
  const projectId = useProjectId();
  const project = useProject();
  const trpc = useTRPC();

  // Fetch environments
  const {data: environmentsData} = useSuspenseQuery(
    trpc.getProjectEnvironments.queryOptions({projectId}),
  );

  // Project details for role check
  const detailsQuery = trpc.getProject.queryOptions({id: projectId});
  const {data: detailsData} = useSuspenseQuery({...detailsQuery});

  // State for dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedEnvironment, setSelectedEnvironment] = useState<{
    id: string;
    name: string;
    requireProposals: boolean;
  } | null>(null);
  const [newEnvironmentName, setNewEnvironmentName] = useState('');
  const [copyFromEnvironmentId, setCopyFromEnvironmentId] = useState('');
  const [editEnvironmentName, setEditEnvironmentName] = useState('');
  const [editRequireProposals, setEditRequireProposals] = useState(true);

  // Mutations
  const createEnvironment = useMutation(trpc.createProjectEnvironment.mutationOptions());
  const updateEnvironment = useMutation(trpc.updateProjectEnvironment.mutationOptions());
  const deleteEnvironment = useMutation(trpc.deleteProjectEnvironment.mutationOptions());
  const updateEnvironmentsOrder = useMutation(
    trpc.updateProjectEnvironmentsOrder.mutationOptions(),
  );

  if (!detailsData.project) return <div className="p-6">Project not found</div>;

  const myRole = detailsData.project.myRole ?? 'viewer';
  const canManageEnvironments = myRole === 'admin';

  const handleCreateEnvironment = async () => {
    if (!copyFromEnvironmentId) {
      toast.error('Please select a source environment to copy configurations from');
      return;
    }

    try {
      await createEnvironment.mutateAsync({
        projectId,
        name: newEnvironmentName.trim(),
        copyFromEnvironmentId,
      });
      toast.success('Environment created successfully');
      setShowCreateDialog(false);
      setNewEnvironmentName('');
      setCopyFromEnvironmentId('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to create environment — please try again');
    }
  };

  const handleUpdateEnvironment = async () => {
    if (!selectedEnvironment) return;
    try {
      await updateEnvironment.mutateAsync({
        environmentId: selectedEnvironment.id,
        name: editEnvironmentName.trim(),
        projectId,
        requireProposals: editRequireProposals,
      });
      toast.success('Environment updated successfully');
      setShowEditDialog(false);
      setSelectedEnvironment(null);
      setEditEnvironmentName('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to update environment — please try again');
    }
  };

  const handleDeleteEnvironment = async () => {
    if (!selectedEnvironment) return;
    try {
      await deleteEnvironment.mutateAsync({
        environmentId: selectedEnvironment.id,
        projectId,
      });
      toast.success('Environment deleted successfully');
      setShowDeleteDialog(false);
      setSelectedEnvironment(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to delete environment — please try again');
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const envs = environmentsData.environments;
    const newOrder = envs.map((env, i) => {
      if (i === index - 1) return {environmentId: env.id, order: index + 1};
      if (i === index) return {environmentId: env.id, order: index};
      return {environmentId: env.id, order: i + 1};
    });

    try {
      await updateEnvironmentsOrder.mutateAsync({
        projectId,
        environmentOrders: newOrder,
      });
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to reorder environments — please try again');
    }
  };

  const handleMoveDown = async (index: number) => {
    const envs = environmentsData.environments;
    if (index >= envs.length - 1) return;

    const newOrder = envs.map((env, i) => {
      if (i === index) return {environmentId: env.id, order: index + 2};
      if (i === index + 1) return {environmentId: env.id, order: index + 1};
      return {environmentId: env.id, order: i + 1};
    });

    try {
      await updateEnvironmentsOrder.mutateAsync({
        projectId,
        environmentOrders: newOrder,
      });
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to reorder environments — please try again');
    }
  };

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
                  <Link href={`/app/projects/${project.id}`}>Settings</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Environments</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-3xl space-y-8">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Environments</h2>
              {canManageEnvironments && (
                <Button
                  onClick={() => {
                    setShowCreateDialog(true);
                    // Default to Production if it exists, otherwise first environment
                    const defaultEnv =
                      environmentsData.environments.find(e => e.name === 'Production') ||
                      environmentsData.environments[0];
                    setCopyFromEnvironmentId(defaultEnv?.id || '');
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add environment
                </Button>
              )}
            </div>

            {!canManageEnvironments && (
              <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-3 mb-4">
                <div className="flex items-start gap-2">
                  <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Only admins can manage environments.
                  </p>
                </div>
              </div>
            )}

            <div className="mb-6 rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-4">
              <div className="flex items-start gap-3">
                <Info className="size-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground mb-2">
                    About environments
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Environments allow you to maintain different configuration values for different
                    deployment stages (e.g., Development, Staging, Production). Each config
                    automatically has a variant for every environment.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {environmentsData.environments.map((env, index) => (
                <div
                  key={env.id}
                  className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-card/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{env.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canManageEnvironments || index === 0}
                      onClick={() => handleMoveUp(index)}
                      title="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={
                        !canManageEnvironments || index === environmentsData.environments.length - 1
                      }
                      onClick={() => handleMoveDown(index)}
                      title="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canManageEnvironments}
                      onClick={() => {
                        setSelectedEnvironment(env);
                        setEditEnvironmentName(env.name);
                        setEditRequireProposals(env.requireProposals);
                        setShowEditDialog(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canManageEnvironments || environmentsData.environments.length <= 1}
                      title={
                        environmentsData.environments.length <= 1
                          ? 'Cannot delete the last environment'
                          : undefined
                      }
                      onClick={() => {
                        setSelectedEnvironment(env);
                        setShowDeleteDialog(true);
                      }}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Create Environment Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Environment</DialogTitle>
            <DialogDescription>
              Create a new environment for this project. All existing configs will automatically get
              a variant for this environment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="env-name">Environment name</Label>
              <Input
                id="env-name"
                value={newEnvironmentName}
                onChange={e => setNewEnvironmentName(e.target.value)}
                placeholder="e.g., Staging, QA, Testing"
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground">
                Use letters, numbers, spaces, hyphens, or underscores (1-50 chars)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="copy-from-env">Copy configuration from</Label>
              <Select value={copyFromEnvironmentId} onValueChange={setCopyFromEnvironmentId}>
                <SelectTrigger id="copy-from-env">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  {environmentsData.environments.map(env => (
                    <SelectItem key={env.id} value={env.id}>
                      {env.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                New environment will copy values, schemas, and overrides from the selected
                environment
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setNewEnvironmentName('');
                setCopyFromEnvironmentId('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateEnvironment}
              disabled={
                createEnvironment.isPending ||
                newEnvironmentName.trim().length === 0 ||
                !copyFromEnvironmentId
              }
            >
              {createEnvironment.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Environment Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Environment</DialogTitle>
            <DialogDescription>
              Rename this environment. This will update the environment name across all configs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="edit-env-name" className="text-sm font-medium">
                Environment name
              </label>
              <Input
                id="edit-env-name"
                value={editEnvironmentName}
                onChange={e => setEditEnvironmentName(e.target.value)}
                placeholder="e.g., Staging, QA, Testing"
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground">
                Use letters, numbers, spaces, hyphens, or underscores (1-50 chars)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false);
                setSelectedEnvironment(null);
                setEditEnvironmentName('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateEnvironment}
              disabled={updateEnvironment.isPending || editEnvironmentName.trim().length === 0}
            >
              {updateEnvironment.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Environment Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Environment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the <strong>{selectedEnvironment?.name}</strong>{' '}
              environment? This will permanently remove all config variants for this environment.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setSelectedEnvironment(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteEnvironment}
              disabled={deleteEnvironment.isPending}
            >
              {deleteEnvironment.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Fragment>
  );
}
