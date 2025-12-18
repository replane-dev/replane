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
import {Trash2} from 'lucide-react';
import * as React from 'react';
import {toast} from 'sonner';

type Role = 'admin' | 'member';

export function WorkspaceMembersSettings({workspaceId}: {workspaceId: string}) {
  const trpc = useTRPC();
  const {data: org} = useSuspenseQuery(trpc.getWorkspace.queryOptions({workspaceId}));
  const {data: membersData} = useSuspenseQuery(
    trpc.getWorkspaceMembers.queryOptions({workspaceId}),
  );

  const [members, setMembers] = React.useState<Array<{email: string; role: Role}>>(
    membersData.map(m => ({email: m.email, role: m.role as Role})) ?? [],
  );

  React.useEffect(() => {
    setMembers(membersData.map(m => ({email: m.email, role: m.role as Role})) ?? []);
  }, [membersData]);

  const addMember = useMutation(trpc.addWorkspaceMember.mutationOptions());
  const removeMember = useMutation(trpc.removeWorkspaceMember.mutationOptions());
  const updateMemberRole = useMutation(trpc.updateWorkspaceMemberRole.mutationOptions());

  const [savingMembers, setSavingMembers] = React.useState(false);

  const canManage = org.myRole === 'admin';

  const handleAddMember = () => {
    setMembers(prev => [...prev, {email: '', role: 'member'}]);
  };

  const handleRemoveMember = async (idx: number, email: string) => {
    // If it's a new member (empty email), just remove from list
    if (!email.trim()) {
      setMembers(prev => prev.filter((_, i) => i !== idx));
      return;
    }

    try {
      await removeMember.mutateAsync({workspaceId, memberEmail: email});
      toast.success('Member removed');
      setMembers(prev => prev.filter((_, i) => i !== idx));
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to remove member — please try again');
    }
  };

  const handleSaveMembers = async () => {
    setSavingMembers(true);
    try {
      const currentEmails = new Set(membersData.map(m => m.email.toLowerCase()));
      const newMembers = members.filter(
        m => m.email.trim() && !currentEmails.has(m.email.toLowerCase()),
      );

      // Add new members
      for (const member of newMembers) {
        await addMember.mutateAsync({
          workspaceId,
          memberEmail: member.email.trim(),
          role: member.role,
        });
      }

      // Update roles for existing members
      const existingMembers = members.filter(m => currentEmails.has(m.email.toLowerCase()));
      for (const member of existingMembers) {
        const original = membersData.find(
          m => m.email.toLowerCase() === member.email.toLowerCase(),
        );
        if (original && original.role !== member.role) {
          await updateMemberRole.mutateAsync({
            workspaceId,
            memberEmail: member.email.trim(),
            role: member.role,
          });
        }
      }

      toast.success('Members updated');
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to save members — please try again');
    } finally {
      setSavingMembers(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Workspace members</h3>
          <p className="text-sm text-muted-foreground">Manage who can access this workspace</p>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={handleAddMember}>
            New member
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {members.length > 0 && (
          <div className="space-y-2">
            {members.map((m, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-card/50"
              >
                <Input
                  placeholder="Email"
                  value={m.email}
                  onChange={e =>
                    setMembers(prev =>
                      prev.map((x, i) => (i === idx ? {...x, email: e.target.value} : x)),
                    )
                  }
                  className="min-w-[200px] flex-1"
                  readOnly={!canManage}
                />
                <Select
                  value={m.role}
                  onValueChange={val =>
                    setMembers(prev =>
                      prev.map((x, i) => (i === idx ? {...x, role: val as Role} : x)),
                    )
                  }
                  disabled={!canManage}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveMember(idx, m.email)}
                  disabled={!canManage}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {canManage && (
          <Button type="button" onClick={handleSaveMembers} disabled={savingMembers}>
            {savingMembers ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>
    </div>
  );
}
