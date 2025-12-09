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
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {useState} from 'react';
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

  // Fetch generated types for the project and environment
  const {data} = useSuspenseQuery(
    trpc.getProjectConfigTypes.queryOptions({
      projectId,
      environmentId,
    }),
  );

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

  const sdkKeyValue = sdkKey || 'your-sdk-key-here';
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://replane.your-domain.com';

  const installSnippet = `npm install replane-sdk`;

  const defineTypesSnippet = `${data.types}`;

  const usageSnippet = `import { createReplaneClient } from 'replane-sdk';
import { type Configs } from './types.js';

const replane = await createReplaneClient<Configs>({
    // Each SDK key is tied to one project and environment
    sdkKey: '${sdkKeyValue}',
    baseUrl: '${baseUrl}',
});

// Get a config value (no await needed, because the client fetches configs during initialization)
const value1 = replane.getConfig('${data.exampleConfigName}');

console.log('The value #1:', value1);

// Replane client receives realtime updates via SSE in the background
// so the value can be different from the first one
const value2 = replane.getConfig('${data.exampleConfigName}');

console.log('The value #2:', value2);

// Clean up when done
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
          <Select value={environmentId} onValueChange={setEnvironmentId}>
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
          >
            Copy
          </Button>
        </div>
        <CodeSnippet code={defineTypesSnippet} language="typescript" />
        <p className="text-xs text-muted-foreground">
          This is the generated code for the selected environment. It includes the types for the
          configs and the client. You can use this code to integrate the Replane SDK into your
          application. You can also generate the code for different environments by selecting a
          different environment in the selector above.
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
          >
            {copiedSnippet === 'basic' ? 'Copied!' : 'Copy'}
          </Button>
        </div>
        <CodeSnippet tabSize={4} code={usageSnippet} language="typescript" />
        {!sdkKey && (
          <p className="text-xs text-muted-foreground italic">
            Replace <code className="px-1 py-0.5 bg-muted rounded">your-sdk-key-here</code> with
            your actual SDK key.
          </p>
        )}
      </div>
    </div>
  );
}
