'use client';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Separator} from '@/components/ui/separator';
import {Switch} from '@/components/ui/switch';
import {Textarea} from '@/components/ui/textarea';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {Trash2} from 'lucide-react';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {toast} from 'sonner';

export function ProjectGeneralSettings({projectId}: {projectId: string}) {
  const trpc = useTRPC();
  const router = useRouter();

  const {data: projectData} = useSuspenseQuery(trpc.getProject.queryOptions({id: projectId}));
  const project = projectData.project!;

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
  const [saving, setSaving] = React.useState(false);

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
      toast.error(e?.message ?? 'Failed to save');
    }
    setSaving(false);
  };

  const myRole = project.myRole ?? 'viewer';
  const canEdit = myRole === 'admin' || myRole === 'maintainer';
  const canDelete = myRole === 'admin' && !requireProposals;

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
            disabled={!canEdit}
            rows={3}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Governance</h4>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="require-proposals">Require proposals</Label>
              <p className="text-xs text-muted-foreground">
                All config changes must go through proposal approval
              </p>
            </div>
            <Switch
              id="require-proposals"
              checked={requireProposals}
              onCheckedChange={setRequireProposals}
              disabled={!canEdit}
            />
          </div>
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

      {canDelete && (
        <div className="pt-6 border-t">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold mb-1">Danger Zone</h4>
              <p className="text-sm text-muted-foreground mb-3">Permanently delete this project</p>
            </div>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={async () => {
                const confirmName = prompt(`Type "${project.name}" to confirm deletion:`);
                if (confirmName !== project.name) return;
                try {
                  await deleteProject.mutateAsync({id: projectId, confirmName});
                  toast.success('Project deleted');
                  router.push('/app');
                } catch (e: any) {
                  toast.error(e?.message ?? 'Failed to delete');
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete project
            </Button>
          </div>
        </div>
      )}

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
