'use client';

import {SdkIntegrationGuide} from '@/components/sdk-integration-guide';
import {SdkKeyExplainer} from '@/components/sdk-key-explainer';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Textarea} from '@/components/ui/textarea';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {toast} from 'sonner';

export interface NewSdkKeyViewProps {
  projectId: string;
  onSuccess?: (id: string) => void;
  onCancel?: () => void;
}

export function NewSdkKeyView({projectId, onSuccess, onCancel}: NewSdkKeyViewProps) {
  const trpc = useTRPC();
  const createMutation = useMutation(trpc.createSdkKey.mutationOptions());

  // Load environments for this project
  const {data: pageData} = useSuspenseQuery(trpc.getNewSdkKeyPageData.queryOptions({projectId}));
  const environments = pageData.environments;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [environmentId, setEnvironmentId] = useState(() => {
    const prodEnv = environments.find(e => e.name === 'Production');
    return prodEnv?.id ?? environments[0]?.id ?? '';
  });
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  if (environments.length === 0) {
    return (
      <div className="rounded-lg border bg-yellow-50 dark:bg-yellow-950/30 p-6 text-center">
        <p className="text-sm font-semibold text-foreground mb-2">No environments found</p>
        <p className="text-sm text-muted-foreground">
          Please create at least one environment first in project settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SdkKeyExplainer />
      {!createdToken && (
        <div className="rounded-lg border bg-card/50 overflow-hidden">
          <div className="border-b bg-muted/30 px-6 py-4">
            <h2 className="text-base font-semibold text-foreground">Create SDK Key</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Provide a name and optional description for your SDK key.
            </p>
          </div>
          <form
            className="p-6 space-y-6"
            onSubmit={async e => {
              e.preventDefault();
              const result = await createMutation.mutateAsync({
                name,
                description,
                projectId,
                environmentId,
              });
              setCreatedToken(result.sdkKey.token);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="api-key-environment" className="text-sm font-medium">
                Environment <span className="text-destructive">*</span>
              </Label>
              <Select value={environmentId} onValueChange={setEnvironmentId}>
                <SelectTrigger id="api-key-environment" className="max-w-md">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  {environments.map(env => (
                    <SelectItem key={env.id} value={env.id}>
                      {env.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The SDK key will only work for the selected environment
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key-name" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="api-key-name"
                value={name}
                maxLength={200}
                required
                onChange={e => setName(e.target.value)}
                placeholder="Production Key"
                className="max-w-md"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key-desc" className="text-sm font-medium">
                Description <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Textarea
                id="api-key-desc"
                value={description}
                maxLength={1000}
                onChange={e => setDescription(e.target.value)}
                placeholder="Used for server-to-server calls from ..."
                className="min-h-[100px]"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create SDK Key'}
              </Button>
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </div>
      )}
      {createdToken && (
        <div className="rounded-lg border border-green-200/50 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20 overflow-hidden">
          <div className="border-b bg-green-100/50 dark:bg-green-900/20 px-6 py-4">
            <h2 className="text-base font-semibold text-foreground">
              SDK Key Created Successfully
            </h2>
            <p className="text-sm text-foreground/80 dark:text-foreground/70 mt-1">
              Copy and store this key securely. You won&apos;t be able to see it again.
            </p>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Your SDK Key</Label>
              <pre className="p-4 bg-muted/50 rounded-lg border text-sm overflow-auto font-mono select-all">
                {createdToken}
              </pre>
              <p className="text-xs text-muted-foreground italic">
                This is the only time the full key will be shown. Make sure to copy it now.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(createdToken);
                    toast.success('Copied to clipboard');
                  } catch (e) {
                    console.error(e);
                    toast.error('Failed to copy');
                  }
                }}
              >
                Copy to Clipboard
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (onSuccess) {
                    // We don't have the ID here, so we just close
                    onSuccess('');
                  }
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {createdToken && (
        <div className="rounded-lg border bg-card/50 overflow-hidden">
          <div className="border-b bg-muted/30 px-6 py-4">
            <h3 className="text-base font-semibold text-foreground">JavaScript SDK Integration</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Use these code examples to integrate Replane into your application.
            </p>
          </div>
          <div className="p-6">
            <SdkIntegrationGuide
              sdkKey={createdToken}
              projectId={projectId}
              environmentId={environmentId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
