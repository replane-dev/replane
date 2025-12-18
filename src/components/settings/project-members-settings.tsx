'use client';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {Info, Trash2} from 'lucide-react';
import * as React from 'react';
import {toast} from 'sonner';

type Role = 'admin' | 'maintainer';

export function ProjectMembersSettings({projectId}: {projectId: string}) {
  const trpc = useTRPC();

  const {data: projectData} = useSuspenseQuery(trpc.getProject.queryOptions({id: projectId}));
  const {data: usersData} = useSuspenseQuery(trpc.getProjectUsers.queryOptions({projectId}));

  const [users, setUsers] = React.useState<Array<{email: string; role: Role}>>(
    usersData.users ?? [],
  );

  React.useEffect(() => {
    setUsers(usersData.users ?? []);
  }, [usersData.users]);

  const patchProject = useMutation(trpc.patchProject.mutationOptions());
  const [savingUsers, setSavingUsers] = React.useState(false);

  const handleAddUser = () => {
    setUsers(prev => [...prev, {email: '', role: 'admin'}]);
  };

  const handleRemoveUser = (idx: number) => {
    setUsers(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveUsers = async () => {
    setSavingUsers(true);
    try {
      const normalized = users
        .map(u => ({email: u.email.trim().toLowerCase(), role: u.role}))
        .filter(u => u.email.length > 0);
      const map = new Map<string, Role>();
      for (const u of normalized) map.set(u.email, u.role);
      const merged = Array.from(map.entries()).map(([email, role]) => ({email, role}));
      await patchProject.mutateAsync({id: projectId, members: {users: merged}});
      toast.success('Project members saved');
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to save members — please try again');
    } finally {
      setSavingUsers(false);
    }
  };

  const myRole = (projectData.project?.myRole ?? 'viewer') as Role | 'viewer';
  const canManageMembers = myRole === 'admin';
  const requireProposals = projectData.project?.requireProposals ?? false;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Project members</h3>
          <p className="text-sm text-muted-foreground">Manage who can access this project</p>
        </div>
        {canManageMembers && (
          <Button size="sm" type="button" variant="outline" onClick={handleAddUser}>
            Add member
          </Button>
        )}
      </div>

      <RoleLegend requireProposals={requireProposals} />

      <div className="space-y-3">
        {users.length > 0 && (
          <div className="space-y-2">
            {users.map((u, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-card/50"
              >
                <Input
                  placeholder="Email"
                  value={u.email}
                  onChange={e =>
                    setUsers(prev =>
                      prev.map((x, i) => (i === idx ? {...x, email: e.target.value} : x)),
                    )
                  }
                  className="min-w-[200px] flex-1"
                  readOnly={!canManageMembers}
                />
                <Select
                  value={u.role}
                  onValueChange={val =>
                    setUsers(prev =>
                      prev.map((x, i) => (i === idx ? {...x, role: val as Role} : x)),
                    )
                  }
                  disabled={!canManageMembers}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="maintainer">Maintainer</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveUser(idx)}
                  disabled={!canManageMembers}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div>
          <Button
            type="button"
            onClick={handleSaveUsers}
            disabled={savingUsers || !canManageMembers}
          >
            {savingUsers ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoleLegend({requireProposals}: {requireProposals: boolean}) {
  return (
    <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-3">
      <div className="flex items-start gap-2">
        <Info className="size-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="flex-1 space-y-2 text-xs text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">Admin</span>:
            {requireProposals
              ? ' Can approve proposals, edit details, manage members, and delete project.'
              : ' Can edit details, manage members, delete project, and manage configs.'}
          </div>
          <div>
            <span className="font-semibold text-foreground">Maintainer</span>:
            {requireProposals
              ? ' Can approve proposals and edit details. Cannot manage members.'
              : ' Can edit details and configs but cannot manage members.'}
          </div>
        </div>
      </div>
    </div>
  );
}
