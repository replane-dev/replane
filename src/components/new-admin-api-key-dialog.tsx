'use client';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
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
import {ADMIN_API_KEY_SCOPES, type AdminApiKeyScope} from '@/engine/core/identity';
import {useTRPC} from '@/trpc/client';
import {useMutation, useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import {Check, Copy, KeyRound} from 'lucide-react';
import * as React from 'react';
import {toast} from 'sonner';

const SCOPE_DESCRIPTIONS: Record<AdminApiKeyScope, string> = {
  'project:read': 'View project details',
  'project:write': 'Create, update, delete projects',
  'config:read': 'View configs and their values',
  'config:write': 'Create, update, delete configs',
  'environment:read': 'View environments',
  'environment:write': 'Create, update, delete environments',
  'sdk_key:read': 'View SDK keys',
  'sdk_key:write': 'Create, delete SDK keys',
  'member:read': 'View project members',
  'member:write': 'Add, update, remove project members',
};

interface NewAdminApiKeyDialogProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewAdminApiKeyDialog({workspaceId, open, onOpenChange}: NewAdminApiKeyDialogProps) {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const [step, setStep] = React.useState<'form' | 'success'>('form');
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [selectedScopes, setSelectedScopes] = React.useState<Set<AdminApiKeyScope>>(new Set());
  const [selectedProjectIds, setSelectedProjectIds] = React.useState<Set<string>>(new Set());
  const [restrictProjects, setRestrictProjects] = React.useState(false);
  const [expiresIn, setExpiresIn] = React.useState<string>('never');
  const [createdToken, setCreatedToken] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const {data: projectList} = useSuspenseQuery(trpc.getProjectList.queryOptions());
  const projects = projectList.projects.filter(p => p.workspaceId === workspaceId);

  const createMutation = useMutation(
    trpc.createAdminApiKey.mutationOptions({
      onSuccess: async data => {
        const key = trpc.listAdminApiKeys.queryKey();
        await qc.invalidateQueries({queryKey: key});
        setCreatedToken(data.adminApiKey.token);
        setStep('success');
      },
      onError: err => {
        toast.error(err?.message ?? 'Failed to create API key');
      },
    }),
  );

  const handleScopeToggle = (scope: AdminApiKeyScope) => {
    const newScopes = new Set(selectedScopes);
    if (newScopes.has(scope)) {
      newScopes.delete(scope);
    } else {
      newScopes.add(scope);
    }
    setSelectedScopes(newScopes);
  };

  const handleProjectToggle = (projectId: string) => {
    const newProjects = new Set(selectedProjectIds);
    if (newProjects.has(projectId)) {
      newProjects.delete(projectId);
    } else {
      newProjects.add(projectId);
    }
    setSelectedProjectIds(newProjects);
  };

  const handleSelectAllScopes = () => {
    setSelectedScopes(new Set(ADMIN_API_KEY_SCOPES));
  };

  const handleClearAllScopes = () => {
    setSelectedScopes(new Set());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedScopes.size === 0) {
      return;
    }

    let expiresAt: Date | null = null;
    if (expiresIn !== 'never') {
      const now = new Date();
      switch (expiresIn) {
        case '7d':
          expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
          break;
      }
    }

    await createMutation.mutateAsync({
      workspaceId,
      name: name.trim(),
      description: description.trim(),
      scopes: Array.from(selectedScopes),
      projectIds: restrictProjects ? Array.from(selectedProjectIds) : null,
      expiresAt,
    });
  };

  const handleCopy = async () => {
    if (createdToken) {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('API key copied to clipboard');
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after dialog closes
    setTimeout(() => {
      setStep('form');
      setName('');
      setDescription('');
      setSelectedScopes(new Set());
      setSelectedProjectIds(new Set());
      setRestrictProjects(false);
      setExpiresIn('never');
      setCreatedToken(null);
      setCopied(false);
    }, 300);
  };

  if (step === 'success' && createdToken) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-green-600" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Make sure to copy your API key now. You won&apos;t be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <div className="relative">
              <code className="block w-full rounded-md bg-muted p-4 font-mono text-sm break-all">
                {createdToken}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Create a new API key to access the Admin API programmatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., CI/CD Pipeline Key"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this API key used for?"
              rows={2}
            />
          </div>

          {/* Scopes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Permissions *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAllScopes}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAllScopes}
                >
                  Clear all
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-md border p-4">
              {ADMIN_API_KEY_SCOPES.map(scope => (
                <label
                  key={scope}
                  className="flex items-start gap-2 rounded-md p-2 hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedScopes.has(scope)}
                    onCheckedChange={() => handleScopeToggle(scope)}
                    className="mt-0.5"
                  />
                  <div>
                    <Badge variant="secondary" className="text-xs font-mono mb-1">
                      {scope}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {SCOPE_DESCRIPTIONS[scope]}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            {selectedScopes.size === 0 && (
              <p className="text-xs text-destructive">
                Select at least one permission
              </p>
            )}
          </div>

          {/* Project restrictions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="restrict-projects"
                checked={restrictProjects}
                onCheckedChange={checked => setRestrictProjects(checked === true)}
              />
              <Label htmlFor="restrict-projects" className="cursor-pointer">
                Restrict to specific projects
              </Label>
            </div>
            {restrictProjects && (
              <div className="rounded-md border p-4 ml-6 space-y-2">
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No projects available in this workspace.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">
                      Select which projects this key can access:
                    </p>
                    {projects.map(project => (
                      <label
                        key={project.id}
                        className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedProjectIds.has(project.id)}
                          onCheckedChange={() => handleProjectToggle(project.id)}
                        />
                        <span className="text-sm">{project.name}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Expiration */}
          <div className="space-y-2">
            <Label htmlFor="expires">Expiration</Label>
            <select
              id="expires"
              value={expiresIn}
              onChange={e => setExpiresIn(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="never">Never expires</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="1y">1 year</option>
            </select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                createMutation.isPending ||
                !name.trim() ||
                selectedScopes.size === 0
              }
            >
              {createMutation.isPending ? 'Creating…' : 'Create API Key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

