'use client';

import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {AlertCircle, Bug, RotateCw} from 'lucide-react';
import {useEffect, useMemo} from 'react';

export type ErrorFallbackProps = {
  error: Error;
  resetErrorBoundary: () => void;
};

/**
 * A polished error UI using shadcn/ui components.
 * Intended for react-error-boundary's FallbackComponent.
 */
export function ErrorFallback({error, resetErrorBoundary}: ErrorFallbackProps) {
  // Optional: log error to an error reporting service here
  useEffect(() => {
     
    console.error('App ErrorBoundary captured error:', error);
  }, [error]);

  const issueUrl = useMemo(() => {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : '';
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const ts = new Date().toISOString();

      const title = `Bug: ${error?.message ?? 'Unhandled error'}`.slice(0, 200);

      const body = [
        '## Description',
        '<!-- Briefly describe what you were doing when this happened -->',
        '',
        '## Steps to Reproduce',
        '1. ...',
        '2. ...',
        '3. ...',
        '',
        '## Expected Behavior',
        '<!-- What did you expect to happen? -->',
        '',
        '## Actual Behavior',
        `${error?.message ?? 'Unknown error'}`,
        '',
        '## Environment',
        `- URL: ${url}`,
        `- User Agent: ${ua}`,
        `- Timestamp: ${ts}`,
        '',
        '## Stack Trace',
        '```',
        `${error?.stack ?? '<no stack available>'}`.slice(0, 8000),
        '```',
      ].join('\n');

      const base = 'https://github.com/replane-dev/replane/issues/new';
      const params = new URLSearchParams({
        title,
        body,
        labels: 'bug',
      });
      return `${base}?${params.toString()}`;
    } catch {
      return 'https://github.com/replane-dev/replane/issues/new/choose';
    }
  }, [error]);

  return (
    <div
      className="min-h-[40vh] w-full flex items-center justify-center p-6"
      style={{backgroundColor: 'var(--sidebar)'}}
    >
      <Card className="max-w-xl w-full border-destructive/30">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-md bg-destructive/10 p-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl">Something went wrong</CardTitle>
              <CardDescription>
                {process.env.NODE_ENV === 'development'
                  ? 'An unexpected error occurred. See details below.'
                  : 'An unexpected error occurred. You can try to reload the view or report this issue.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {process.env.NODE_ENV === 'development' && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Details</p>
              <pre className="mt-1 whitespace-pre-wrap break-words">
                {error?.message || String(error)}
              </pre>
            </div>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            If this keeps happening, please report it on GitHub. The report will include the error
            message, stack trace, your current URL, user agent, and a timestamp. Remove any
            sensitive data before submitting.
          </p>
        </CardContent>
        <CardFooter className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RotateCw className="mr-2 h-4 w-4" /> Reload page
          </Button>
          <Button variant="secondary" asChild>
            <a href={issueUrl} target="_blank" rel="noreferrer noopener">
              <Bug className="mr-2 h-4 w-4" /> Report on GitHub
            </a>
          </Button>
          <Button onClick={resetErrorBoundary}>Try again</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
