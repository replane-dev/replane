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
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useTRPC} from '@/trpc/client';
import {useMutation} from '@tanstack/react-query';
import {Lock, Trash2} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {Fragment} from 'react';
import {toast} from 'sonner';
import {useWorkspace} from '../../utils';

export default function WorkspaceGeneralSettingsPage() {
  const org = useWorkspace();
  const workspaceId = org.id;
  const trpc = useTRPC();
  const router = useRouter();

  const [name, setName] = React.useState(org.name);

  React.useEffect(() => {
    setName(org.name);
  }, [org]);

  const updateWorkspace = useMutation(trpc.updateWorkspace.mutationOptions());
  const [savingSettings, setSavingSettings] = React.useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await updateWorkspace.mutateAsync({
        workspaceId,
        name,
      });
      toast.success('Workspace settings saved');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save settings');
    }
    setSavingSettings(false);
  };

  const canEdit = org.myRole === 'admin';

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
                <BreadcrumbPage>General</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-3xl space-y-8">
          <section>
            <h2 className="mb-4 text-xl font-semibold">Workspace settings</h2>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="rounded-lg border bg-card/50 p-4 space-y-4">
                <div>
                  <Label htmlFor="org-name" className="mb-1.5 block text-sm font-medium">
                    Name
                  </Label>
                  <Input
                    id="org-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    readOnly={!canEdit}
                    aria-readonly={!canEdit}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Workspace display name (1-100 chars)
                  </p>
                </div>

                {!canEdit && (
                  <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-3">
                    <div className="flex items-start gap-2">
                      <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Only workspace admins can change settings.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={savingSettings || name.trim() === '' || !canEdit}>
                  {savingSettings ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </section>

          <section>
            <h2 className="mb-4 text-xl font-semibold">Danger zone</h2>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <Trash2 className="size-5 text-destructive mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-1">
                      Delete workspace
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Deleting an workspace will permanently remove all its projects. This action
                      cannot be undone.
                    </p>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="destructive"
                          disabled={!canEdit}
                          title={!canEdit ? 'Only admins can delete an workspace' : undefined}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete workspace
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete workspace</DialogTitle>
                          <DialogDescription>
                            Please type the workspace name to confirm deletion. This action
                            cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <DeleteWorkspaceForm
                          workspaceId={workspaceId}
                          workspaceName={org.name}
                          onDeleted={() => {
                            toast.success('Workspace deleted');
                            router.push('/app');
                          }}
                        />
                        <DialogFooter />
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Fragment>
  );
}

function DeleteWorkspaceForm({
  workspaceId,
  workspaceName,
  onDeleted,
}: {
  workspaceId: string;
  workspaceName: string;
  onDeleted: () => void;
}) {
  const trpc = useTRPC();
  const [confirm, setConfirm] = React.useState('');
  const [isSubmitting, setSubmitting] = React.useState(false);
  const canDelete = confirm.trim() === workspaceName;
  const deleteWorkspace = useMutation(trpc.deleteWorkspace.mutationOptions());

  const handleDelete = async () => {
    if (!canDelete) return;
    setSubmitting(true);
    try {
      await deleteWorkspace.mutateAsync({workspaceId});
      onDeleted();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to delete workspace');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="confirm-org-name" className="mb-1 block text-sm font-medium">
          Type workspace name to confirm
        </Label>
        <Input
          id="confirm-org-name"
          placeholder={workspaceName}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          autoFocus
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="destructive" disabled={!canDelete || isSubmitting} onClick={handleDelete}>
          {isSubmitting ? 'Deleting…' : 'Delete workspace'}
        </Button>
      </div>
    </div>
  );
}
