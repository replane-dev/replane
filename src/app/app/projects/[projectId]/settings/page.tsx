'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Textarea} from '@/components/ui/textarea';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {Lock, Plus, Trash2} from 'lucide-react';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {toast} from 'sonner';

type Role = 'owner' | 'admin';

export default function ProjectSettingsPage() {
  const projectId = useProjectId();
  const trpc = useTRPC();
  const router = useRouter();

  // Project details
  const detailsQuery = trpc.getProject.queryOptions({id: projectId});
  const {data: detailsData} = useSuspenseQuery({...detailsQuery});
  const [name, setName] = React.useState(detailsData.project?.name ?? '');
  const [description, setDescription] = React.useState(detailsData.project?.description ?? '');
  React.useEffect(() => {
    setName(detailsData.project?.name ?? '');
    setDescription(detailsData.project?.description ?? '');
  }, [detailsData.project?.name, detailsData.project?.description]);
  const patchProject = useMutation(trpc.patchProject.mutationOptions());

  // Project users
  const usersQuery = trpc.getProjectUsers.queryOptions({projectId});
  const {data: usersData} = useSuspenseQuery({...usersQuery});
  const [users, setUsers] = React.useState<Array<{email: string; role: Role}>>(
    usersData.users ?? [],
  );
  React.useEffect(() => {
    setUsers(usersData.users ?? []);
  }, [usersData.users]);

  const [savingDetails, setSavingDetails] = React.useState(false);
  const [savingUsers, setSavingUsers] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDetails(true);
    setMsg(null);
    setErr(null);
    try {
      await patchProject.mutateAsync({id: projectId, details: {name, description}});
      toast.success('Project details saved');
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save details');
    }
    setSavingDetails(false);
  };

  const handleAddUser = () => {
    setUsers(prev => [...prev, {email: '', role: 'admin'}]);
  };

  const handleRemoveUser = (email: string, idx: number) => {
    setUsers(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveUsers = async () => {
    setSavingUsers(true);
    setMsg(null);
    setErr(null);
    try {
      const normalized = users
        .map(u => ({email: u.email.trim().toLowerCase(), role: u.role}))
        .filter(u => u.email.length > 0);
      const map = new Map<string, Role>();
      for (const u of normalized) map.set(u.email, u.role);
      const merged = Array.from(map.entries()).map(([email, role]) => ({email, role}));
      await patchProject.mutateAsync({id: projectId, members: {users: merged}});
      toast.success('Project users saved');
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save users');
    } finally {
      setSavingUsers(false);
    }
  };

  if (!detailsData.project) return <div className="p-6">Project not found</div>;

  const myRole = (detailsData.project.myRole ?? 'viewer') as Role | 'viewer';
  // Permissions
  const canEditDetails = myRole === 'owner' || myRole === 'admin';
  const canManageMembers = myRole === 'owner';
  const canDeleteProject = myRole === 'owner';

  return (
    <div className="p-6 space-y-10 max-w-3xl">
      <section>
        <h2 className="mb-4 text-xl font-semibold">Project details</h2>
        <form onSubmit={handleSaveDetails} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              readOnly={!canEditDetails}
              aria-readonly={!canEditDetails}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Use letters, numbers, hyphens and underscores (1-100 chars)
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
              readOnly={!canEditDetails}
              aria-readonly={!canEditDetails}
              rows={4}
            />
            {!canEditDetails && (
              <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> Only owners or admins can change project details.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={savingDetails || name.trim() === '' || !canEditDetails}>
              {savingDetails ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Members</h2>
        <div className="space-y-3">
          {users.map((u, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Email"
                value={u.email}
                onChange={e =>
                  setUsers(prev =>
                    prev.map((x, i) => (i === idx ? {...x, email: e.target.value} : x)),
                  )
                }
                className="min-w-[260px] flex-1"
                readOnly={!canManageMembers}
                aria-readonly={!canManageMembers}
              />
              <Select
                value={u.role}
                onValueChange={val =>
                  setUsers(prev => prev.map((x, i) => (i === idx ? {...x, role: val as Role} : x)))
                }
                disabled={!canManageMembers}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleRemoveUser(u.email, idx)}
                title="Remove"
                disabled={!canManageMembers}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddUser}
              disabled={!canManageMembers}
            >
              <Plus className="mr-1 h-4 w-4" /> Add member
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSaveUsers}
              disabled={savingUsers || !canManageMembers}
            >
              {savingUsers ? 'Saving…' : 'Save members'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            {canManageMembers ? (
              <>Only owners can manage members. At least one owner is required.</>
            ) : (
              <>
                <Lock className="h-3 w-3" /> You don't have permission to manage members. Only
                owners can make changes.
              </>
            )}
          </p>
        </div>
      </section>

      {msg ? <p className="text-sm text-green-600">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <section className="pt-4">
        <h2 className="mb-2 text-xl font-semibold">Danger zone</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Deleting a project will permanently remove its configs and API keys. This action cannot be
          undone.
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="text-destructive"
              disabled={!canDeleteProject}
              title={!canDeleteProject ? 'Only owners can delete a project' : undefined}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete project</DialogTitle>
              <DialogDescription>
                Please type the project name to confirm deletion. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DeleteProjectForm
              projectId={projectId}
              projectName={detailsData.project.name}
              onDeleted={() => {
                toast.success('Project deleted');
                router.push('/app');
              }}
            />
            <DialogFooter />
          </DialogContent>
        </Dialog>
      </section>
    </div>
  );
}

function DeleteProjectForm({
  projectId,
  projectName,
  onDeleted,
}: {
  projectId: string;
  projectName: string;
  onDeleted: () => void;
}) {
  const trpc = useTRPC();
  const [confirm, setConfirm] = React.useState('');
  const [isSubmitting, setSubmitting] = React.useState(false);
  const canDelete = confirm.trim() === projectName;
  const deleteProject = useMutation(trpc.deleteProject.mutationOptions());

  const handleDelete = async () => {
    if (!canDelete) return;
    setSubmitting(true);
    try {
      await deleteProject.mutateAsync({id: projectId, confirmName: confirm.trim()});
      onDeleted();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to delete project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium">Type project name to confirm</label>
        <Input
          placeholder={projectName}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          autoFocus
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="destructive" disabled={!canDelete || isSubmitting} onClick={handleDelete}>
          {isSubmitting ? 'Deleting…' : 'Delete project'}
        </Button>
      </div>
    </div>
  );
}
