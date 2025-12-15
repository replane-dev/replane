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
import {Switch} from '@/components/ui/switch';
import {Textarea} from '@/components/ui/textarea';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {Lock, Trash2} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {Fragment} from 'react';
import {toast} from 'sonner';
import {useProject} from '../../utils';

type Role = 'admin' | 'maintainer';

export default function GeneralSettingsPage() {
  const projectId = useProjectId();
  const project = useProject();
  const trpc = useTRPC();
  const router = useRouter();

  // Project details
  const detailsQuery = trpc.getProject.queryOptions({id: projectId});
  const {data: detailsData} = useSuspenseQuery({...detailsQuery});

  const [name, setName] = React.useState(detailsData.project?.name ?? '');
  const [description, setDescription] = React.useState(detailsData.project?.description ?? '');
  const [requireProposals, setRequireProposals] = React.useState(
    detailsData.project?.requireProposals ?? false,
  );
  const [allowSelfApprovals, setAllowSelfApprovals] = React.useState(
    detailsData.project?.allowSelfApprovals ?? false,
  );

  React.useEffect(() => {
    setName(detailsData.project?.name ?? '');
    setDescription(detailsData.project?.description ?? '');
    setRequireProposals(detailsData.project?.requireProposals ?? false);
    setAllowSelfApprovals(detailsData.project?.allowSelfApprovals ?? false);
  }, [
    detailsData.project?.name,
    detailsData.project?.description,
    detailsData.project?.requireProposals,
    detailsData.project?.allowSelfApprovals,
  ]);
  const patchProject = useMutation(trpc.patchProject.mutationOptions());

  const [savingDetails, setSavingDetails] = React.useState(false);

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDetails(true);
    try {
      await patchProject.mutateAsync({
        id: projectId,
        details: {name, description, requireProposals, allowSelfApprovals},
      });
      toast.success('Project settings saved');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save settings');
    }
    setSavingDetails(false);
  };

  if (!detailsData.project) return <div className="p-6">Project not found</div>;

  const myRole = (detailsData.project.myRole ?? 'viewer') as Role | 'viewer';
  const canEditDetails = myRole === 'admin' || myRole === 'maintainer';
  const canDeleteProject = myRole === 'admin';
  const proposalsRequired = detailsData.project.requireProposals;

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
                <BreadcrumbPage>General</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-3xl space-y-8">
          <section>
            <h2 className="mb-4 text-xl font-semibold">General settings</h2>
            <form onSubmit={handleSaveDetails} className="space-y-4">
              <div className="rounded-lg border bg-card/50 p-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Name</label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g., Mobile App, Web Dashboard, API Service"
                    required
                    readOnly={!canEditDetails}
                    aria-readonly={!canEditDetails}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Use letters, numbers, hyphens and underscores (1-100 chars)
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Description</label>
                  <Textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe what this project is for..."
                    readOnly={!canEditDetails}
                    aria-readonly={!canEditDetails}
                    rows={4}
                  />
                </div>

                <Separator />

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Governance Settings</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="require-review" className="text-sm font-medium">
                          Require Review
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          When enabled, all config changes must go through the proposal workflow
                        </p>
                      </div>
                      <Switch
                        id="require-review"
                        checked={requireProposals}
                        onCheckedChange={setRequireProposals}
                        disabled={!canEditDetails}
                      />
                    </div>

                    {requireProposals && (
                      <div className="flex items-center justify-between ml-4 pl-4 border-l-2">
                        <div className="space-y-0.5">
                          <Label htmlFor="allow-self-approvals" className="text-sm font-medium">
                            Allow Self-Approvals
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Allow proposal creators to approve their own proposals
                          </p>
                        </div>
                        <Switch
                          id="allow-self-approvals"
                          checked={allowSelfApprovals}
                          onCheckedChange={setAllowSelfApprovals}
                          disabled={!canEditDetails}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {!canEditDetails && (
                  <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-3">
                    <div className="flex items-start gap-2">
                      <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Only admins or maintainers can change project settings.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={savingDetails || name.trim() === '' || !canEditDetails}
                >
                  {savingDetails ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </section>

          {!proposalsRequired && (
            <section>
              <h2 className="mb-4 text-xl font-semibold">Danger zone</h2>
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <Trash2 className="size-5 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground mb-1">
                        Delete project
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Deleting a project will permanently remove its configs and SDK keys. This
                        action cannot be undone.
                      </p>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="destructive"
                            disabled={!canDeleteProject}
                            title={
                              !canDeleteProject ? 'Only admins can delete a project' : undefined
                            }
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete project
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Delete project</DialogTitle>
                            <DialogDescription>
                              Please type the project name to confirm deletion. This action cannot
                              be undone.
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
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </Fragment>
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
