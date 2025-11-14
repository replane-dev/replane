'use client';

import {CodeSnippet} from '@/components/code-snippet';
import {Button} from '@/components/ui/button';
import {Code} from 'lucide-react';
import {useState} from 'react';
import {toast} from 'sonner';

interface ApiKeySdkGuideProps {
  apiKey?: string | null;
}

export function ApiKeySdkGuide({apiKey}: ApiKeySdkGuideProps) {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const handleCopy = async (code: string, snippetId: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedSnippet(snippetId);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedSnippet(null), 2000);
    } catch (e) {
      toast.error('Failed to copy');
    }
  };

  const apiKeyValue = apiKey || 'your-api-key-here';
  const isPlaceholder = !apiKey;

  const installSnippet = `npm install replane-sdk
# or
pnpm add replane-sdk
# or
yarn add replane-sdk`;

  const basicUsageSnippet = `import { createReplaneClient } from 'replane-sdk';

const replane = createReplaneClient({
  apiKey: '${apiKeyValue}',
  baseUrl: 'https://your-replane-instance.com',
});

// One-off fetch
const featureFlag = await replane
  .getConfigValue<boolean>('new-onboarding')
  .catch(() => false);`;

  const typedExampleSnippet = `interface PasswordRequirements {
  minLength: number;
  requireSymbol: boolean;
}

const passwordReqs = await replane
  .getConfigValue<PasswordRequirements>('password-requirements')
  .catch(() => ({ minLength: 8, requireSymbol: false }));`;

  const realtimeSnippet = `// Watch for realtime updates via SSE
const billingEnabled = await replane.watchConfigValue<boolean>(
  'billing-enabled'
);

// Read the latest value
if (billingEnabled.get()) {
  console.log('Billing enabled!');
}

// Clean up when done
billingEnabled.close();`;

  return (
    <div className="rounded-lg border bg-card/50 overflow-hidden">
      <div className="border-b bg-muted/30 px-6 py-4">
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-base font-semibold text-foreground">JavaScript SDK Integration</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Use these code examples to integrate Replane into your application.
        </p>
      </div>

      <div className="p-6 space-y-6">
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

        {/* Basic Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">2. Initialize the client</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(basicUsageSnippet, 'basic')}
              className="h-7 text-xs"
            >
              {copiedSnippet === 'basic' ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <CodeSnippet code={basicUsageSnippet} language="typescript" />
          {isPlaceholder && (
            <p className="text-xs text-muted-foreground italic">
              Replace <code className="px-1 py-0.5 bg-muted rounded">your-api-key-here</code> with
              your actual API key.
            </p>
          )}
        </div>

        {/* Typed Example */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">3. Use TypeScript types</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(typedExampleSnippet, 'typed')}
              className="h-7 text-xs"
            >
              {copiedSnippet === 'typed' ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <CodeSnippet code={typedExampleSnippet} language="typescript" />
        </div>

        {/* Realtime Updates */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              4. Realtime updates (optional)
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(realtimeSnippet, 'realtime')}
              className="h-7 text-xs"
            >
              {copiedSnippet === 'realtime' ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <CodeSnippet code={realtimeSnippet} language="typescript" />
          <p className="text-xs text-muted-foreground">
            Get instant updates via Server-Sent Events when configs change.
          </p>
        </div>
      </div>
    </div>
  );
}
