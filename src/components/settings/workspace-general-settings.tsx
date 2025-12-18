'use client';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {Trash2} from 'lucide-react';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {toast} from 'sonner';

export function WorkspaceGeneralSettings({workspaceId}: {workspaceId: string}) {
  const trpc = useTRPC();
  const router = useRouter();

  const {data: org} = useSuspenseQuery(trpc.getWorkspace.queryOptions({workspaceId}));
  const [name, setName] = React.useState(org.name);

  React.useEffect(() => {
    setName(org.name);
  }, [org.name]);

  const updateWorkspace = useMutation(trpc.updateWorkspace.mutationOptions());
  const deleteWorkspace = useMutation(trpc.deleteWorkspace.mutationOptions());
  const [saving, setSaving] = React.useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateWorkspace.mutateAsync({workspaceId, name});
      toast.success('Workspace settings saved');
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to save workspace settings — please try again');
    }
    setSaving(false);
  };

  const canEdit = org.myRole === 'admin';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold">Workspace settings</h3>
        <p className="text-sm text-muted-foreground">Manage workspace details</p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <Label htmlFor="org-name">Name</Label>
          <Input
            id="org-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Acme Corp, Marketing Team, Personal Projects"
            disabled={!canEdit}
            maxLength={100}
          />
        </div>
        <Button type="submit" disabled={saving || !canEdit || name.trim() === ''}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>

      {canEdit && (
        <div className="pt-6 border-t">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold mb-1">Danger Zone</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Permanently delete this workspace and all its projects
              </p>
            </div>
            <Button
              // outline
              variant="outline"
              className="text-destructive"
              onClick={async () => {
                if (!confirm(`Delete workspace "${org.name}"? This will delete all projects.`))
                  return;
                // Redirect optimistically before deletion to avoid errors
                router.push('/app');
                try {
                  await deleteWorkspace.mutateAsync({workspaceId});
                } catch (e: any) {
                  // User has already navigated away, but log the error
                  console.error('Failed to delete workspace:', e);
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete workspace
            </Button>
          </div>
        </div>
      )}

      <div className="pt-6 border-t">
        <div className="space-y-2">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">Workspace ID</span>
            <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {workspaceId}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
