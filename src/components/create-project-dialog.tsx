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
import {Textarea} from '@/components/ui/textarea';
import {useProjects} from '@/contexts/project-context';
import {useTRPC} from '@/trpc/client';
import {useMutation} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {toast} from 'sonner';

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceName: string;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
}: CreateProjectDialogProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSubmitting, setSubmitting] = React.useState(false);

  const {refresh: refreshProjects} = useProjects();

  const createProject = useMutation(trpc.createProject.mutationOptions());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const {projectId} = await createProject.mutateAsync({
        workspaceId,
        name,
        description,
      });
      await refreshProjects();
      toast.success('Project created');
      router.push(`/app/projects/${projectId}/configs`);
      onOpenChange(false);
      setName('');
      setDescription('');
    } catch (err: any) {
      toast.error(err?.message ?? 'Unable to create project — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Create a new project within <span className="font-medium">{workspaceName}</span>{' '}
            workspace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="project-name" className="mb-1.5 block text-sm font-medium">
              Name
            </Label>
            <Input
              id="project-name"
              placeholder="e.g., Mobile App, Web Dashboard, API Service"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="project-description" className="mb-1.5 block text-sm font-medium">
              Description
            </Label>
            <Textarea
              id="project-description"
              placeholder="Describe what this project is for..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || name.trim() === ''}>
              {isSubmitting ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
