import {AlertTriangle} from 'lucide-react';

export default function ApiNotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div>
            <h1 className="text-xl font-semibold">API Endpoint Not Found</h1>
            <p className="text-sm text-muted-foreground mt-1">
              404 - The requested API endpoint does not exist
            </p>
          </div>
        </div>

        <div className="bg-muted rounded-lg p-4 space-y-3 text-sm">
          <p className="font-medium">Available API endpoints:</p>
          <ul className="space-y-1.5 text-muted-foreground font-mono text-xs">
            <li>
              • <span className="text-foreground">/api/health</span> - Health check
            </li>
            <li>
              • <span className="text-foreground">/api/v1/*</span> - Public API (requires API key)
            </li>
            <li>
              • <span className="text-foreground">/api/auth/*</span> - Authentication endpoints
            </li>
            <li>
              • <span className="text-foreground">/api/internal/trpc/*</span> - Internal tRPC API
            </li>
          </ul>
        </div>

        <div className="text-sm text-muted-foreground">
          <p>
            See the{' '}
            <a
              href="https://replane.dev/docs/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              API documentation
            </a>{' '}
            for more information.
          </p>
        </div>
      </div>
    </div>
  );
}
