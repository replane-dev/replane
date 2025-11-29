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
import {useOrganization} from '../../utils';

export default function OrganizationGeneralSettingsPage() {
  const org = useOrganization();
  const organizationId = org.id;
  const trpc = useTRPC();
  const router = useRouter();

  const [name, setName] = React.useState(org.name);

  React.useEffect(() => {
    setName(org.name);
  }, [org]);

  const updateOrganization = useMutation(trpc.updateOrganization.mutationOptions());
  const [savingSettings, setSavingSettings] = React.useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await updateOrganization.mutateAsync({
        organizationId,
        name,
      });
      toast.success('Organization settings saved');
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
                  <Link href={`/app/organizations/${organizationId}/settings/general`}>
                    Organization Settings
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
            <h2 className="mb-4 text-xl font-semibold">Organization settings</h2>
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
                    Organization display name (1-100 chars)
                  </p>
                </div>

                {!canEdit && (
                  <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-3">
                    <div className="flex items-start gap-2">
                      <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Only organization admins can change settings.
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
                      Delete organization
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Deleting an organization will permanently remove all its projects. This action
                      cannot be undone.
                    </p>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="destructive"
                          disabled={!canEdit}
                          title={!canEdit ? 'Only admins can delete an organization' : undefined}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete organization
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete organization</DialogTitle>
                          <DialogDescription>
                            Please type the organization name to confirm deletion. This action
                            cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <DeleteOrganizationForm
                          organizationId={organizationId}
                          organizationName={org.name}
                          onDeleted={() => {
                            toast.success('Organization deleted');
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

function DeleteOrganizationForm({
  organizationId,
  organizationName,
  onDeleted,
}: {
  organizationId: string;
  organizationName: string;
  onDeleted: () => void;
}) {
  const trpc = useTRPC();
  const [confirm, setConfirm] = React.useState('');
  const [isSubmitting, setSubmitting] = React.useState(false);
  const canDelete = confirm.trim() === organizationName;
  const deleteOrganization = useMutation(trpc.deleteOrganization.mutationOptions());

  const handleDelete = async () => {
    if (!canDelete) return;
    setSubmitting(true);
    try {
      await deleteOrganization.mutateAsync({organizationId});
      onDeleted();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to delete organization');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="confirm-org-name" className="mb-1 block text-sm font-medium">
          Type organization name to confirm
        </Label>
        <Input
          id="confirm-org-name"
          placeholder={organizationName}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          autoFocus
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="destructive" disabled={!canDelete || isSubmitting} onClick={handleDelete}>
          {isSubmitting ? 'Deleting…' : 'Delete organization'}
        </Button>
      </div>
    </div>
  );
}
