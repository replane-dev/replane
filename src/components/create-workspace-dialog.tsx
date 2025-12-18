'use client';

import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {useProjects} from '@/contexts/project-context';
import {useTRPC} from '@/trpc/client';
import {useMutation} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {toast} from 'sonner';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceDialog({open, onOpenChange}: CreateWorkspaceDialogProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [isSubmitting, setSubmitting] = React.useState(false);

  const createWorkspace = useMutation(trpc.createWorkspace.mutationOptions());

  const {refresh: refreshAppLayout} = useProjects();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const {projectId} = await createWorkspace.mutateAsync({name});
      await refreshAppLayout();
      toast.success('Workspace created');
      // Navigate to the new workspace's first project configs
      router.push(`/app/projects/${projectId}/configs`);
      onOpenChange(false);
      setName('');
    } catch (err: any) {
      toast.error(err?.message ?? 'Unable to create workspace — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            Create a new workspace to group related projects together.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="workspace-name" className="mb-1.5 block text-sm font-medium">
              Name
            </Label>
            <Input
              id="workspace-name"
              placeholder="e.g., Acme Corp, Marketing Team, Personal Projects"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              maxLength={100}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              A name for your workspace (1-100 characters)
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || name.trim() === ''}>
              {isSubmitting ? 'Creating…' : 'Create workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

