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

type Role = 'admin' | 'member';

export function OrganizationMembersSettings({organizationId}: {organizationId: string}) {
  const trpc = useTRPC();
  const {data: org} = useSuspenseQuery(trpc.getOrganization.queryOptions({organizationId}));
  const {data: membersData} = useSuspenseQuery(
    trpc.getOrganizationMembers.queryOptions({organizationId}),
  );

  const [members, setMembers] = React.useState<Array<{email: string; role: Role}>>(
    membersData.map(m => ({email: m.email, role: m.role as Role})) ?? [],
  );

  React.useEffect(() => {
    setMembers(membersData.map(m => ({email: m.email, role: m.role as Role})) ?? []);
  }, [membersData]);

  const addMember = useMutation(trpc.addOrganizationMember.mutationOptions());
  const removeMember = useMutation(trpc.removeOrganizationMember.mutationOptions());
  const updateMemberRole = useMutation(trpc.updateOrganizationMemberRole.mutationOptions());

  const [savingMembers, setSavingMembers] = React.useState(false);

  const isPersonal = !!org.personalOrgUserId;
  const canManage = org.myRole === 'admin' && !isPersonal;

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
      await removeMember.mutateAsync({organizationId, memberEmail: email});
      toast.success('Member removed');
      setMembers(prev => prev.filter((_, i) => i !== idx));
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to remove member');
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
          organizationId,
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
            organizationId,
            memberEmail: member.email.trim(),
            role: member.role,
          });
        }
      }

      toast.success('Members updated');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save members');
    } finally {
      setSavingMembers(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Members</h3>
          <p className="text-sm text-muted-foreground">Manage who can access this organization</p>
        </div>
        {!isPersonal && canManage && (
          <Button size="sm" variant="outline" onClick={handleAddMember}>
            New member
          </Button>
        )}
      </div>

      {isPersonal && (
        <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-4">
          <div className="flex items-start gap-3">
            <Info className="size-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-foreground/80">
                This is your personal organization. You cannot add or remove members.
              </p>
            </div>
          </div>
        </div>
      )}

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
