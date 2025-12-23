'use client';

import {AdminApiKeysTable} from '@/components/admin-api-keys-table';
import {NewAdminApiKeyDialog} from '@/components/new-admin-api-key-dialog';
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {Lock} from 'lucide-react';
import * as React from 'react';

export function WorkspaceApiKeysSettings({workspaceId}: {workspaceId: string}) {
  const trpc = useTRPC();
  const {data: org} = useSuspenseQuery(trpc.getWorkspace.queryOptions({workspaceId}));

  const [newKeyDialogOpen, setNewKeyDialogOpen] = React.useState(false);

  const isAdmin = org.myRole === 'admin';

  if (!isAdmin) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h3 className="text-lg font-semibold">API Keys</h3>
          <p className="text-sm text-muted-foreground">
            Manage API keys for programmatic access to your workspace
          </p>
        </div>

        <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-4">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Admin access required</p>
              <p className="text-sm text-muted-foreground mt-1">
                Only workspace administrators can manage API keys. Contact a workspace admin if you
                need API access.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">API Keys</h3>
        <p className="text-sm text-muted-foreground">
          API keys allow programmatic access to the Admin API. Use them for CI/CD pipelines,
          automation scripts, and external integrations.
        </p>
      </div>

      <React.Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }
      >
        <AdminApiKeysTable
          workspaceId={workspaceId}
          onNewApiKeyClick={() => setNewKeyDialogOpen(true)}
        />
      </React.Suspense>

      <NewAdminApiKeyDialog
        workspaceId={workspaceId}
        open={newKeyDialogOpen}
        onOpenChange={setNewKeyDialogOpen}
      />
    </div>
  );
}

