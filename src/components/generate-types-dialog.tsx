'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {CodeSnippet} from '@/components/code-snippet';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Skeleton} from '@/components/ui/skeleton';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {UsageExampleSnippet} from '@/components/usage-example-snippet';
import {
  getTypesFileName,
  SDK_LANGUAGE_LIST,
  SDK_LANGUAGES,
  type SdkLanguage,
} from '@/lib/sdk-languages';
import {SDK_STORAGE_KEYS, useLocalStorage} from '@/lib/use-local-storage';
import {useTRPC} from '@/trpc/client';
import {useQuery, useSuspenseQuery} from '@tanstack/react-query';
import {Suspense, useEffect, useRef, useState} from 'react';
import {toast} from 'sonner';

interface GenerateTypesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerateTypesDialog({open, onOpenChange}: GenerateTypesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-2xl lg:max-w-4xl w-full max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Types</DialogTitle>
          <DialogDescription>
            Generate types for your configs. Select an environment and language to see the types
            based on schemas for that environment.
          </DialogDescription>
        </DialogHeader>
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <GenerateTypesContent />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

function GenerateTypesContent() {
  const projectId = useProjectId();
  const trpc = useTRPC();
  const [selectedLanguage, setSelectedLanguage] = useLocalStorage<SdkLanguage>(
    SDK_STORAGE_KEYS.LANGUAGE,
    'javascript',
  );

  // Fetch environments
  const {data: environmentsData} = useSuspenseQuery(
    trpc.getProjectEnvironments.queryOptions({projectId}),
  );

  const defaultEnvironment = environmentsData.environments[0];
  if (!defaultEnvironment) {
    throw new Error('No default environment found: project must have at least one environment');
  }

  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(defaultEnvironment.id);

  // Track pending environment name for toast after fetch completes
  const pendingEnvNameRef = useRef<string | null>(null);

  // Get the codegen language for the selected SDK language
  const codegenLanguage = SDK_LANGUAGES[selectedLanguage].codegenLanguage;

  // Fetch generated types for selected environment and language
  // Using useQuery instead of useSuspenseQuery to prevent unmounting the Monaco editor
  // when the environment changes (which would dispose the editor and cause errors)
  const {data, isLoading, isFetching, error} = useQuery(
    trpc.getProjectConfigTypes.queryOptions({
      projectId,
      environmentId: selectedEnvironmentId,
      language: codegenLanguage,
    }),
  );

  const sdkKey = 'your-sdk-key-here';
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://replane.your-domain.com';

  // Show toast when fetch completes after environment change
  useEffect(() => {
    if (!isFetching && pendingEnvNameRef.current) {
      toast.success(`Switched to ${pendingEnvNameRef.current} environment`);
      pendingEnvNameRef.current = null;
    }
  }, [isFetching]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data?.types ?? '');
      toast.success('Copied to clipboard');
    } catch (e) {
      console.error(e);
      toast.error('Unable to copy to clipboard', {
        description: 'Please try selecting and copying the code manually.',
      });
    }
  };

  const langConfig = SDK_LANGUAGES[selectedLanguage];

  return (
    <div className="space-y-4">
      {/* Language selector tabs */}
      <Tabs
        value={selectedLanguage}
        onValueChange={value => setSelectedLanguage(value as SdkLanguage)}
      >
        <TabsList className="grid w-full grid-cols-3">
          {SDK_LANGUAGE_LIST.map(lang => (
            <TabsTrigger key={lang} value={lang}>
              {SDK_LANGUAGES[lang].displayName}
            </TabsTrigger>
          ))}
        </TabsList>

        {SDK_LANGUAGE_LIST.map(lang => (
          <TabsContent key={lang} value={lang} className="space-y-4 mt-4">
            {/* Environment selector */}
            <div className="space-y-2">
              <Label htmlFor="environment-select" className="text-sm font-medium">
                Environment
              </Label>
              <Select
                value={selectedEnvironmentId}
                onValueChange={id => {
                  const env = environmentsData.environments.find(e => e.id === id);
                  if (env) {
                    pendingEnvNameRef.current = env.name;
                  }
                  setSelectedEnvironmentId(id);
                }}
              >
                <SelectTrigger id="environment-select">
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
            </div>

            {/* Generated code */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Generated Types{' '}
                  <span className="text-muted-foreground font-normal">
                    ({getTypesFileName(selectedLanguage)})
                  </span>
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-7 text-xs"
                  disabled={isLoading || !data || !!error}
                >
                  Copy
                </Button>
              </div>
              {error ? (
                <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                  <p className="text-sm font-medium text-destructive">
                    Unable to generate types — please try again
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {error instanceof Error ? error.message : 'An unknown error occurred'}
                  </p>
                </div>
              ) : isLoading || !data ? (
                <Skeleton className="h-48 w-full rounded-lg" />
              ) : (
                <CodeSnippet code={data.types} language={langConfig.codeLanguage} />
              )}
            </div>

            {/* Usage example */}
            <UsageExampleSnippet
              language={selectedLanguage}
              sdkKey={sdkKey}
              baseUrl={baseUrl}
              typesData={data}
              isLoading={isLoading}
              label="Usage Example"
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
