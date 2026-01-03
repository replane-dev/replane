'use client';

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
import {Switch} from '@/components/ui/switch';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {UsageExampleSnippet} from '@/components/usage-example-snippet';
import {getTypesFileName, SDK_LANGUAGE_LIST, SDK_LANGUAGES, type SdkLanguage} from '@/lib/sdk-languages';
import {SDK_STORAGE_KEYS, useLocalStorage} from '@/lib/use-local-storage';
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
  const [selectedLanguage, setSelectedLanguage] = useLocalStorage<SdkLanguage>(
    SDK_STORAGE_KEYS.LANGUAGE,
    'javascript',
  );
  const [codegenEnabled, setCodegenEnabled] = useLocalStorage(
    SDK_STORAGE_KEYS.CODEGEN_ENABLED,
    false,
  );
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

  // Get the codegen language for the selected SDK language
  const codegenLanguage = SDK_LANGUAGES[selectedLanguage].codegenLanguage;

  // Fetch generated types for the project and environment - only when codegen is enabled
  const {
    data: typesData,
    isLoading: isTypesLoading,
    isFetching: isTypesFetching,
  } = useQuery({
    ...trpc.getProjectConfigTypes.queryOptions({
      projectId,
      environmentId,
      language: codegenLanguage,
    }),
    enabled: codegenEnabled,
  });

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
      toast.error('Unable to copy to clipboard', {
        description: 'Please try selecting and copying the code manually.',
      });
    }
  };

  const sdkKeyValue = sdkKey || 'your-project-sdk-key-here';
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://replane.your-domain.com';

  const langConfig = SDK_LANGUAGES[selectedLanguage];
  const installSnippet = langConfig.installSnippet;
  const defineTypesSnippet = typesData?.types ?? '';

  const showEnvironmentSelector = !initialEnvironmentId;

  return (
    <div className="space-y-6">
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
          <TabsContent key={lang} value={lang} className="space-y-6 mt-6">
            {/* Installation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">1. Install the SDK</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(installSnippet, `install-${lang}`)}
                  className="h-7 text-xs"
                >
                  {copiedSnippet === `install-${lang}` ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <CodeSnippet code={installSnippet} language="shell" />
            </div>

            {/* Codegen toggle and section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-foreground">
                    2. Generate types{' '}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Generate typed definitions from your config schemas for better IDE support.
                  </p>
                </div>
                <Switch
                  id={`codegen-toggle-${lang}`}
                  checked={codegenEnabled}
                  onCheckedChange={setCodegenEnabled}
                />
              </div>

              {codegenEnabled && (
                <div className="space-y-4 pl-0 border-l-2 border-muted ml-0">
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

                  {/* Generated types */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        Generated types{' '}
                        <span className="text-muted-foreground font-normal">
                          ({getTypesFileName(selectedLanguage)})
                        </span>
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(defineTypesSnippet, `generated-${lang}`)}
                        className="h-7 text-xs"
                        disabled={isTypesLoading || !typesData}
                      >
                        Copy
                      </Button>
                    </div>
                    {isTypesLoading || !typesData ? (
                      <Skeleton className="h-48 w-full rounded-lg" />
                    ) : (
                      <CodeSnippet code={defineTypesSnippet} language={langConfig.codeLanguage} />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Basic Usage */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">3. Use the client</h4>
              <UsageExampleSnippet
                language={selectedLanguage}
                sdkKey={sdkKeyValue}
                baseUrl={baseUrl}
                typesData={codegenEnabled ? typesData : null}
                isLoading={codegenEnabled && isTypesLoading}
                label=""
              />
              {!sdkKey && (
                <p className="text-xs text-muted-foreground italic">
                  Replace{' '}
                  <code className="px-1 py-0.5 bg-muted rounded">your-project-sdk-key-here</code>{' '}
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
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
