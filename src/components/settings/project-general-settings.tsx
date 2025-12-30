'use client';

import {ImportConfigsDialog} from '@/components/import-configs-dialog';
import {Button} from '@/components/ui/button';
import {Help} from '@/components/ui/help';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Separator} from '@/components/ui/separator';
import {Switch} from '@/components/ui/switch';
import {Textarea} from '@/components/ui/textarea';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {useTRPC} from '@/trpc/client';
import {useMutation, useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import {Download, Globe, Trash2, Upload} from 'lucide-react';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {toast} from 'sonner';

export function ProjectGeneralSettings({projectId}: {projectId: string}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {data: projectData} = useSuspenseQuery(trpc.getProject.queryOptions({id: projectId}));
  const {data: environmentsData} = useSuspenseQuery(
    trpc.getProjectEnvironments.queryOptions({projectId}),
  );
  const project = projectData.project!;
  const environments = environmentsData.environments;

  const [name, setName] = React.useState(project.name);
  const [description, setDescription] = React.useState(project.description);
  const [requireProposals, setRequireProposals] = React.useState(project.requireProposals);
  const [allowSelfApprovals, setAllowSelfApprovals] = React.useState(project.allowSelfApprovals);

  React.useEffect(() => {
    setName(project.name);
    setDescription(project.description);
    setRequireProposals(project.requireProposals);
    setAllowSelfApprovals(project.allowSelfApprovals);
  }, [project]);

  const patchProject = useMutation(trpc.patchProject.mutationOptions());
  const deleteProject = useMutation(trpc.deleteProject.mutationOptions());
  const updateEnvironment = useMutation(trpc.updateProjectEnvironment.mutationOptions());
  const [saving, setSaving] = React.useState(false);
  const [updatingEnvId, setUpdatingEnvId] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [importDialogOpen, setImportDialogOpen] = React.useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await queryClient.fetchQuery(
        trpc.exportProjectConfigs.queryOptions({projectId}),
      );
      const blob = new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${result.projectName}-configs-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Configs exported successfully');
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to export configs — please try again');
    }
    setExporting(false);
  };

  const handleEnvironmentRequireProposalsChange = async (
    envId: string,
    envName: string,
    newValue: boolean,
  ) => {
    setUpdatingEnvId(envId);
    try {
      await updateEnvironment.mutateAsync({
        environmentId: envId,
        name: envName,
        projectId,
        requireProposals: newValue,
      });
      toast.success(`${envName} updated`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to update environment — please try again');
    }
    setUpdatingEnvId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await patchProject.mutateAsync({
        id: projectId,
        details: {name, description, requireProposals, allowSelfApprovals},
      });
      toast.success('Project settings saved');
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to save changes — please try again');
    }
    setSaving(false);
  };

  const myRole = project.myRole ?? 'viewer';
  const canEdit = myRole === 'admin' || myRole === 'maintainer';
  const isAdmin = myRole === 'admin';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold">Project settings</h3>
        <p className="text-sm text-muted-foreground">Manage project details and governance</p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Mobile App, Web Dashboard, API Service"
            disabled={!canEdit}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-desc">Description</Label>
          <Textarea
            id="project-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe what this project is for..."
            disabled={!canEdit}
            rows={3}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Governance</h4>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="require-review">Require review</Label>
              <p className="text-xs text-muted-foreground">
                All config changes must go through review
              </p>
            </div>
            <Switch
              id="require-review"
              checked={requireProposals}
              onCheckedChange={setRequireProposals}
              disabled={!canEdit}
            />
          </div>

          {/* Per-environment proposal settings */}
          {requireProposals && environments.length > 0 && (
            <div className="ml-6 pl-4 border-l-2 border-muted space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Per-environment settings
                </span>
                <Help>
                  <p>
                    Control which environments require proposal approval. Environments with this
                    enabled will block direct config changes.
                  </p>
                </Help>
              </div>
              {environments.map(env => (
                <div key={env.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{env.name}</span>
                  </div>
                  <Switch
                    checked={env.requireProposals}
                    onCheckedChange={value =>
                      handleEnvironmentRequireProposalsChange(env.id, env.name, value)
                    }
                    disabled={!canEdit || updatingEnvId === env.id}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="allow-self-approvals">Allow self-approvals</Label>
              <p className="text-xs text-muted-foreground">Users can approve their own proposals</p>
            </div>
            <Switch
              id="allow-self-approvals"
              checked={allowSelfApprovals}
              onCheckedChange={setAllowSelfApprovals}
              disabled={!canEdit}
            />
          </div>
        </div>

        <Button type="submit" disabled={saving || !canEdit}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>

      <div className="pt-6 border-t">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold mb-1">Import / Export</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Import configs from a file or export all configs as JSON
            </p>
          </div>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Button
                    variant="outline"
                    onClick={() => setImportDialogOpen(true)}
                    disabled={!canEdit || requireProposals}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Import configs
                  </Button>
                </span>
              </TooltipTrigger>
              {requireProposals && (
                <TooltipContent className="max-w-xs">
                  <p>
                    Import is disabled when review is required. Disable &ldquo;Require review&rdquo;
                    to import configs.
                  </p>
                </TooltipContent>
              )}
              {!canEdit && !requireProposals && (
                <TooltipContent>
                  <p>You don&apos;t have permission to import configs</p>
                </TooltipContent>
              )}
            </Tooltip>
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <Download className="mr-2 h-4 w-4" />
              {exporting ? 'Exporting…' : 'Export configs'}
            </Button>
          </div>
        </div>
      </div>

      <ImportConfigsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        projectId={projectId}
      />

      <div className="pt-6 border-t">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold mb-1">Danger Zone</h4>
            <p className="text-sm text-muted-foreground mb-3">Permanently delete this project</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={!isAdmin}
                  onClick={async () => {
                    const confirmName = prompt(`Type "${project.name}" to confirm deletion:`);
                    if (confirmName !== project.name) return;
                    // Redirect optimistically before deletion to avoid errors
                    router.push('/app');
                    try {
                      await deleteProject.mutateAsync({id: projectId, confirmName});
                    } catch (e: any) {
                      // User has already navigated away, but log the error
                      console.error('Failed to delete project:', e);
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete project
                </Button>
              </span>
            </TooltipTrigger>
            {!isAdmin && (
              <TooltipContent>
                <p>Only project admins can delete this project</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>

      <div className="pt-6 border-t">
        <div className="space-y-2">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">Project ID</span>
            <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {projectId}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
