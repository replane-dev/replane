'use client';

import {CodeSnippet} from '@/components/code-snippet';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Skeleton} from '@/components/ui/skeleton';
import {
  generateUsageSnippet,
  generateUsageSnippetWithCodegen,
  SDK_LANGUAGES,
  type SdkLanguage,
} from '@/lib/sdk-languages';
import {useState} from 'react';
import {toast} from 'sonner';

interface UsageExampleSnippetProps {
  language: SdkLanguage;
  sdkKey: string;
  baseUrl: string;
  /** Generated types data - when provided, enables codegen mode */
  typesData?: {
    exampleConfigName: string;
    configNames: string[];
  } | null;
  /** Whether codegen types are loading */
  isLoading?: boolean;
  /** Optional label override */
  label?: string;
}

export function UsageExampleSnippet({
  language,
  sdkKey,
  baseUrl,
  typesData,
  isLoading = false,
  label = 'Usage Example',
}: UsageExampleSnippetProps) {
  const [copied, setCopied] = useState(false);

  const langConfig = SDK_LANGUAGES[language];
  const exampleConfigName = typesData?.exampleConfigName ?? 'your-config';
  const configNames = typesData?.configNames ?? ['your-config'];

  // Generate usage snippet based on whether codegen is enabled
  const usageSnippet = typesData
    ? generateUsageSnippetWithCodegen({
        language,
        sdkKey,
        baseUrl,
        exampleConfigName,
        configNames,
      })
    : generateUsageSnippet({
        language,
        sdkKey,
        baseUrl,
        exampleConfigName,
      });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(usageSnippet);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
      toast.error('Unable to copy to clipboard', {
        description: 'Please try selecting and copying the code manually.',
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 text-xs"
          disabled={isLoading}
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <CodeSnippet tabSize={4} code={usageSnippet} language={langConfig.codeLanguage} />
      )}
    </div>
  );
}

