'use client';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {useProjects} from '@/contexts/project-context';
import {useTRPC} from '@/trpc/client';
import {useMutation} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {useWorkspace} from '../utils';

export default function NewProjectPage() {
  const trpc = useTRPC();
  const router = useRouter();
  const workspace = useWorkspace();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const {refresh: refreshProjects} = useProjects();

  const createProject = useMutation(trpc.createProject.mutationOptions());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const {projectId} = await createProject.mutateAsync({
        workspaceId: workspace.id,
        name,
        description,
      });
      await refreshProjects();
      router.push(`/app/projects/${projectId}/configs`);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Create a new project</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My Project"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting || name.trim() === ''}>
            {submitting ? 'Creating…' : 'Create project'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
