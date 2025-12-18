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
import {Input} from '@/components/ui/input';
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
import {Info, Lock, Plus, Trash2} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import {Fragment} from 'react';
import {toast} from 'sonner';
import {useProject} from '../../utils';

type Role = 'admin' | 'maintainer';

export default function MembersSettingsPage() {
  const projectId = useProjectId();
  const project = useProject();
  const trpc = useTRPC();

  // Project details for role check
  const detailsQuery = trpc.getProject.queryOptions({id: projectId});
  const {data: detailsData} = useSuspenseQuery({...detailsQuery});

  // Project users
  const usersQuery = trpc.getProjectUsers.queryOptions({projectId});
  const {data: usersData} = useSuspenseQuery({...usersQuery});
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

  const handleRemoveUser = (email: string, idx: number) => {
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

  if (!detailsData.project) return <div className="p-6">Project not found</div>;

  const myRole = (detailsData.project.myRole ?? 'viewer') as Role | 'viewer';
  const canManageMembers = myRole === 'admin';
  const requireProposals = detailsData.project.requireProposals;

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
                <BreadcrumbPage>Members</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-3xl space-y-8">
          <section>
            <h2 className="mb-4 text-xl font-semibold">Project members</h2>
            <div className="mb-4">
              <RoleLegend requireProposals={requireProposals} />
            </div>
            <div className="space-y-3">
              {users.length > 0 && (
                <div className="space-y-3">
                  {users.map((u, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors"
                    >
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
                          setUsers(prev =>
                            prev.map((x, i) => (i === idx ? {...x, role: val as Role} : x)),
                          )
                        }
                        disabled={!canManageMembers}
                      >
                        <SelectTrigger className="w-[160px]">
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
                        onClick={() => handleRemoveUser(u.email, idx)}
                        title="Remove"
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
              {!canManageMembers && (
                <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-3">
                  <div className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      You don&apos;t have permission to manage members. Only admins can make
                      changes.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </Fragment>
  );
}

function RoleLegend({requireProposals}: {requireProposals: boolean}) {
  return (
    <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-4">
      <div className="flex items-start gap-3">
        <Info className="size-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <div className="text-sm font-semibold text-foreground mb-2">Project member roles</div>
            <div className="space-y-2.5 text-sm text-muted-foreground">
              <div>
                <span className="font-semibold text-foreground">Admin</span>:
                {requireProposals
                  ? ' Can approve all config change proposals. Can edit project details, manage members, and delete project. Must create proposals to change configs.'
                  : ' Can edit project details, manage project members, delete project, and manage all configs.'}
              </div>
              <div>
                <span className="font-semibold text-foreground">Maintainer</span>:
                {requireProposals
                  ? ' Can approve all config change proposals. Can edit project details. Cannot manage members or delete project. Must create proposals to change configs.'
                  : ' Can edit project details and configs but cannot manage project members or delete the project.'}
              </div>
              <div>
                <span className="font-semibold text-foreground">Everyone else</span>: Can view
                configs and {requireProposals ? 'must' : 'can'} create proposals to suggest changes.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
