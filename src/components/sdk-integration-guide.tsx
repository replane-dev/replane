'use client';

import {useProject} from '@/app/app/projects/[projectId]/utils';
import {CodeSnippet} from '@/components/code-snippet';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Skeleton} from '@/components/ui/skeleton';
import {useTRPC} from '@/trpc/client';
import {useQuery, useSuspenseQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {toast} from 'sonner';

interface SdkIntegrationGuideProps {
  sdkKey?: string | null;
  projectId: string;
  environmentId?: string;
}

export function SdkIntegrationGuide({
  sdkKey,
  projectId,
  environmentId: initialEnvironmentId,
}: SdkIntegrationGuideProps) {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const trpc = useTRPC();

  // Fetch environments if environmentId not provided
  const {data: environmentsData} = useSuspenseQuery(
    trpc.getProjectEnvironments.queryOptions({projectId}),
  );

  const defaultEnvironment = environmentsData.environments[0];
  if (!defaultEnvironment) {
    throw new Error('No default environment found: project must have at least one environment');
  }

  const [environmentId, setEnvironmentId] = useState(initialEnvironmentId ?? defaultEnvironment.id);

  // Track pending environment name for toast after fetch completes
  const pendingEnvNameRef = useRef<string | null>(null);

  // Fetch generated types for the project and environment
  // Using useQuery instead of useSuspenseQuery to prevent unmounting Monaco editors
  // when the environment changes (which would dispose the editor and cause errors)
  const {
    data: typesData,
    isLoading: isTypesLoading,
    isFetching: isTypesFetching,
  } = useQuery(
    trpc.getProjectConfigTypes.queryOptions({
      projectId,
      environmentId,
      origin: window.location.origin,
    }),
  );

  // Show toast when fetch completes after environment change
  useEffect(() => {
    if (!isTypesFetching && pendingEnvNameRef.current) {
      toast.success(`Switched to ${pendingEnvNameRef.current} environment`);
      pendingEnvNameRef.current = null;
    }
  }, [isTypesFetching]);

  const handleCopy = async (code: string, snippetId: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedSnippet(snippetId);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedSnippet(null), 2000);
    } catch (e) {
      console.error(e);
      toast.error('Failed to copy code snippet');
    }
  };

  const project = useProject();

  const sdkKeyValue = sdkKey || 'your-project-sdk-key-here';
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://replane.your-domain.com';

  const installSnippet = `npm install @replanejs/sdk`;

  const defineTypesSnippet = typesData?.types ?? '';

  const exampleConfigName = typesData?.exampleConfigName ?? 'your-config';
  const usageSnippet = `import { createReplaneClient } from '@replanejs/sdk';
import { type Configs } from './types';

// Create client (fetches project's configs during initialization)
const replane = await createReplaneClient<Configs>({
    sdkKey: '${sdkKeyValue}',
    baseUrl: '${baseUrl}',
});

// Get config value with full type safety
const config = replane.get('${exampleConfigName}');

// Use context for overrides (see https://replane.dev/docs/guides/override-rules)
const userConfig = replane.get('${exampleConfigName}', {
    context: {
        userId: 'user-123',
        country: 'US',
    },
});

// Configs are automatically updated in realtime via SSE
// No need to refetch or reload - just call get() again

// Clean up when your application shuts down
replane.close();`;

  const showEnvironmentSelector = !initialEnvironmentId;

  return (
    <div className="space-y-6">
      {/* Environment selector */}
      {showEnvironmentSelector && (
        <div className="space-y-2">
          <Label htmlFor="sdk-environment-select" className="text-sm font-medium">
            Environment
          </Label>
          <Select
            value={environmentId}
            onValueChange={id => {
              const env = environmentsData.environments.find(e => e.id === id);
              if (env) {
                pendingEnvNameRef.current = env.name;
              }
              setEnvironmentId(id);
            }}
          >
            <SelectTrigger id="sdk-environment-select">
              <SelectValue placeholder="Select environment" />
            </SelectTrigger>
            <SelectContent>
              {environmentsData.environments.map(env => (
                <SelectItem key={env.id} value={env.id}>
                  {env.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Types are generated based on the schemas for the selected environment.
          </p>
        </div>
      )}

      {/* Installation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">1. Install the SDK</h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(installSnippet, 'install')}
            className="h-7 text-xs"
          >
            {copiedSnippet === 'install' ? 'Copied!' : 'Copy'}
          </Button>
        </div>
        <CodeSnippet code={installSnippet} language="shell" />
      </div>

      {/* Define types */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">2. Define types</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(defineTypesSnippet, 'generated')}
            className="h-7 text-xs"
            disabled={isTypesLoading || !typesData}
          >
            Copy
          </Button>
        </div>
        {isTypesLoading || !typesData ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <CodeSnippet code={defineTypesSnippet} language="typescript" />
        )}
        <p className="text-xs text-muted-foreground">
          This is the generated code for the selected environment. You can use this code to
          integrate the Replane SDK into your application. You can also generate the code for
          different environments by selecting a different environment in the selector above.
        </p>
      </div>

      {/* Basic Usage */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">3. Use the client</h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(usageSnippet, 'basic')}
            className="h-7 text-xs"
            disabled={isTypesLoading || !typesData}
          >
            {copiedSnippet === 'basic' ? 'Copied!' : 'Copy'}
          </Button>
        </div>
        {isTypesLoading || !typesData ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : (
          <CodeSnippet tabSize={4} code={usageSnippet} language="typescript" />
        )}
        {!sdkKey && (
          <p className="text-xs text-muted-foreground italic">
            Replace <code className="px-1 py-0.5 bg-muted rounded">your-project-sdk-key-here</code>{' '}
            with your actual SDK key.{' '}
            <Link
              href={`/app/projects/${projectId}/sdk-keys?new`}
              className="text-primary underline hover:no-underline"
            >
              Create a new SDK key
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
