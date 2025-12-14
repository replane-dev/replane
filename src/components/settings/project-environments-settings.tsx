'use client';

import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Help} from '@/components/ui/help';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Switch} from '@/components/ui/switch';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {ArrowDown, ArrowUp, Globe, Info, Pencil, ShieldCheck, Trash2} from 'lucide-react';
import {useState} from 'react';
import {toast} from 'sonner';

export function ProjectEnvironmentsSettings({projectId}: {projectId: string}) {
  const trpc = useTRPC();

  const {data: environmentsData} = useSuspenseQuery(
    trpc.getProjectEnvironments.queryOptions({projectId}),
  );
  const {data: projectData} = useSuspenseQuery(trpc.getProject.queryOptions({id: projectId}));

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
  const [editRequireProposals, setEditRequireProposals] = useState(false);

  const createEnvironment = useMutation(trpc.createProjectEnvironment.mutationOptions());
  const updateEnvironment = useMutation(trpc.updateProjectEnvironment.mutationOptions());
  const deleteEnvironment = useMutation(trpc.deleteProjectEnvironment.mutationOptions());
  const updateEnvironmentsOrder = useMutation(
    trpc.updateProjectEnvironmentsOrder.mutationOptions(),
  );

  const myRole = projectData.project?.myRole ?? 'viewer';
  const canManageEnvironments = myRole === 'admin';

  const handleCreateEnvironment = async () => {
    if (!copyFromEnvironmentId) {
      toast.error('Please select an environment to copy from');
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
      toast.error(e?.message ?? 'Failed to create environment');
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
      setEditRequireProposals(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to update environment');
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
      toast.error(e?.message ?? 'Failed to delete environment');
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
      await updateEnvironmentsOrder.mutateAsync({projectId, environmentOrders: newOrder});
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to reorder environments');
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
      await updateEnvironmentsOrder.mutateAsync({projectId, environmentOrders: newOrder});
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to reorder environments');
    }
  };

  return (
    <>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Project environments</h3>
            <p className="text-sm text-muted-foreground">
              Manage project environments and their order
            </p>
          </div>
          {canManageEnvironments && (
            <Button
              size="sm"
              onClick={() => {
                setShowCreateDialog(true);
                const defaultEnv =
                  environmentsData.environments.find(e => e.name === 'Production') ||
                  environmentsData.environments[0];
                setCopyFromEnvironmentId(defaultEnv?.id || '');
              }}
            >
              New environment
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Environments allow different config values per deployment stage. Each config has a
              variant for every environment.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {environmentsData.environments.map((env, index) => (
            <div
              key={env.id}
              className="flex items-center justify-between gap-3 p-3 border rounded-lg"
            >
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{env.name}</span>
                {env.requireProposals && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 rounded-full cursor-default">
                        <ShieldCheck className="h-3 w-3" />
                        Requires proposals
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Changes to this environment require proposals</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center gap-1">
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
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Environment</DialogTitle>
            <DialogDescription>
              Create a new environment. All configs will get a variant for this environment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="env-name">Environment name</Label>
              <Input
                id="env-name"
                value={newEnvironmentName}
                onChange={e => setNewEnvironmentName(e.target.value)}
                placeholder="e.g., Staging, QA"
                maxLength={50}
              />
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
                Copies values, schemas, and overrides from selected environment
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
                createEnvironment.isPending || !newEnvironmentName.trim() || !copyFromEnvironmentId
              }
            >
              {createEnvironment.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Environment</DialogTitle>
            <DialogDescription>Configure environment settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-env-name">Environment name</Label>
              <Input
                id="edit-env-name"
                value={editEnvironmentName}
                onChange={e => setEditEnvironmentName(e.target.value)}
                maxLength={50}
              />
            </div>
            {projectData.project?.requireProposals && (
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="edit-require-proposals" className="cursor-pointer">
                      Require proposals
                    </Label>
                    <Help>
                      <p>
                        When enabled, changes to config values in this environment will require
                        approval through a proposal. This only applies when the project has
                        &quot;Require proposals&quot; enabled.
                      </p>
                    </Help>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Changes to this environment require proposal
                  </p>
                </div>
                <Switch
                  id="edit-require-proposals"
                  checked={editRequireProposals}
                  onCheckedChange={setEditRequireProposals}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false);
                setSelectedEnvironment(null);
                setEditEnvironmentName('');
                setEditRequireProposals(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateEnvironment}
              disabled={updateEnvironment.isPending || !editEnvironmentName.trim()}
            >
              {updateEnvironment.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Environment</DialogTitle>
            <DialogDescription>
              Delete the <strong>{selectedEnvironment?.name}</strong> environment? This will
              permanently remove all config variants for this environment.
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
    </>
  );
}
