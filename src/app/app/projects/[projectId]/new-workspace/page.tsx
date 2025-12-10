'use client';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useProjects} from '@/contexts/project-context';
import {useTRPC} from '@/trpc/client';
import {useMutation} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import * as React from 'react';

export default function NewWorkspacePage() {
  const trpc = useTRPC();
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const createWorkspace = useMutation(trpc.createWorkspace.mutationOptions());

  const {refresh: refreshAppLayout} = useProjects();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const {projectId} = await createWorkspace.mutateAsync({name});
      console.log('projectId', projectId);
      await refreshAppLayout();
      // Navigate to the new workspace's first project configs
      router.push(`/app/projects/${projectId}/configs`);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create workspace');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Create a new workspace</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My Workspace"
            required
            maxLength={100}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            A name for your workspace (1-100 characters)
          </p>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting || name.trim() === ''}>
            {submitting ? 'Creating…' : 'Create workspace'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
