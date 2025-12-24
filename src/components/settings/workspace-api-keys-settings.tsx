'use client';

import {AdminApiKeyDetailView} from '@/components/admin-api-key-detail-view';
import {AdminApiKeysTable} from '@/components/admin-api-keys-table';
import {NewAdminApiKeyDialog} from '@/components/new-admin-api-key-dialog';
import {Button} from '@/components/ui/button';
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {ArrowLeft, Lock} from 'lucide-react';
import * as React from 'react';

type View = {type: 'list'} | {type: 'detail'; apiKeyId: string};

export function WorkspaceApiKeysSettings({workspaceId}: {workspaceId: string}) {
  const trpc = useTRPC();
  const {data: org} = useSuspenseQuery(trpc.getWorkspace.queryOptions({workspaceId}));

  const [view, setView] = React.useState<View>({type: 'list'});
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

  // Detail view
  if (view.type === 'detail') {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => setView({type: 'list'})}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to API Keys
        </Button>

        <React.Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          }
        >
          <AdminApiKeyDetailView
            id={view.apiKeyId}
            workspaceId={workspaceId}
            onBack={() => setView({type: 'list'})}
            onDelete={() => setView({type: 'list'})}
          />
        </React.Suspense>
      </div>
    );
  }

  // List view
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
          onApiKeyClick={id => setView({type: 'detail', apiKeyId: id})}
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
