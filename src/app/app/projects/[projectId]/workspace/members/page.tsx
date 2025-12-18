'use client';

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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {Lock, MoreHorizontal, Plus, Trash2, UserCog} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import {Fragment} from 'react';
import {toast} from 'sonner';
import {useWorkspace} from '../../utils';

export default function WorkspaceMembersPage() {
  const org = useWorkspace();
  const workspaceId = org.id;
  const trpc = useTRPC();

  const membersQuery = trpc.getWorkspaceMembers.queryOptions({workspaceId});
  const {data: members, refetch: refetchMembers} = useSuspenseQuery({...membersQuery});

  const canManage = org.myRole === 'admin';

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
                  <Link href={`/app/workspaces/${workspaceId}/settings/general`}>
                    Workspace Settings
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Members</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-4xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Workspace members</h2>
              <p className="text-sm text-muted-foreground">
                Manage who has access to this workspace
              </p>
            </div>
            {canManage && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add workspace member</DialogTitle>
                    <DialogDescription>
                      Add a new member to this workspace. They will have access to view all
                      projects.
                    </DialogDescription>
                  </DialogHeader>
                  <AddMemberForm
                    workspaceId={workspaceId}
                    onAdded={() => {
                      refetchMembers();
                      toast.success('Member added successfully');
                    }}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>

          {!canManage && (
            <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-3">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Only workspace admins can manage members.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No members found
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map(member => (
                    <TableRow key={member.email}>
                      <TableCell className="font-medium">{member.email}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset">
                          {member.role === 'admin' ? 'Admin' : 'Member'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <MemberActionsMenu
                            member={member}
                            workspaceId={workspaceId}
                            onSuccess={refetchMembers}
                            canManage={canManage}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </Fragment>
  );
}

function AddMemberForm({workspaceId, onAdded}: {workspaceId: string; onAdded: () => void}) {
  const trpc = useTRPC();
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<'admin' | 'member'>('member');
  const [isSubmitting, setSubmitting] = React.useState(false);
  const [open, setOpen] = React.useState(true);

  const addMember = useMutation(trpc.addWorkspaceMember.mutationOptions());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addMember.mutateAsync({
        workspaceId,
        memberEmail: email,
        role,
      });
      onAdded();
      setOpen(false);
      setEmail('');
      setRole('member');
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to add member — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="member-email" className="mb-1.5 block text-sm font-medium">
          Email
        </Label>
        <Input
          id="member-email"
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="member-role" className="mb-1.5 block text-sm font-medium">
          Role
        </Label>
        <Select value={role} onValueChange={v => setRole(v as 'admin' | 'member')}>
          <SelectTrigger id="member-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member (read-only)</SelectItem>
            <SelectItem value="admin">Admin (full access)</SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {role === 'admin'
            ? 'Admins can manage workspace settings and members'
            : 'Members can view all projects but need explicit roles to edit'}
        </p>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add member'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function MemberActionsMenu({
  member,
  workspaceId,
  onSuccess,
  canManage,
}: {
  member: {email: string; role: string};
  workspaceId: string;
  onSuccess: () => void;
  canManage: boolean;
}) {
  const trpc = useTRPC();
  const removeMember = useMutation(trpc.removeWorkspaceMember.mutationOptions());
  const updateRole = useMutation(trpc.updateWorkspaceMemberRole.mutationOptions());

  const handleRemove = async () => {
    if (!confirm(`Remove ${member.email} from this workspace?`)) return;

    try {
      await removeMember.mutateAsync({
        workspaceId,
        memberEmail: member.email,
      });
      toast.success('Member removed');
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to remove member — please try again');
    }
  };

  const handleChangeRole = async () => {
    const newRole = member.role === 'admin' ? 'member' : 'admin';
    try {
      await updateRole.mutateAsync({
        workspaceId,
        memberEmail: member.email,
        role: newRole as 'admin' | 'member',
      });
      toast.success('Role updated');
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to update role — please try again');
    }
  };

  if (!canManage) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleChangeRole}>
          <UserCog className="mr-2 h-4 w-4" />
          Change to {member.role === 'admin' ? 'member' : 'admin'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleRemove} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Remove member
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
