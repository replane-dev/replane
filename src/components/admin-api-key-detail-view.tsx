'use client';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import type {AdminApiKeyScope} from '@/engine/core/identity';
import {useTRPC} from '@/trpc/client';
import {useMutation, useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import {format, formatDistanceToNow} from 'date-fns';
import {
  CalendarDays,
  Clock,
  FileKey,
  FolderOpen,
  Shield,
  Timer,
  Trash2,
  User,
} from 'lucide-react';
import {useState} from 'react';
import {toast} from 'sonner';

export interface AdminApiKeyDetailViewProps {
  id: string;
  workspaceId: string;
  onBack: () => void;
  onDelete?: () => void;
}

export function AdminApiKeyDetailView({
  id,
  workspaceId,
  onBack,
  onDelete,
}: AdminApiKeyDetailViewProps) {
  const qc = useQueryClient();
  const trpc = useTRPC();

  const {data} = useSuspenseQuery(trpc.listAdminApiKeys.queryOptions({workspaceId}));
  const apiKey = data.adminApiKeys.find(k => k.id === id);

  const deleteMutation = useMutation(
    trpc.deleteAdminApiKey.mutationOptions({
      onSuccess: async () => {
        const key = trpc.listAdminApiKeys.queryKey();
        await qc.invalidateQueries({queryKey: key});
        toast.success('API key deleted');
        onDelete?.();
        onBack();
      },
      onError: err => {
        toast.error(err?.message ?? 'Failed to delete API key');
      },
    }),
  );

  const [confirming, setConfirming] = useState(false);

  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">API key not found</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          Go back
        </Button>
      </div>
    );
  }

  const isExpired = apiKey.expiresAt ? new Date(apiKey.expiresAt) < new Date() : false;

  return (
    <div className="space-y-6">
      {/* API Key Details */}
      <div className="rounded-lg border bg-card/50 p-4">
        <div className="space-y-4">
          {/* Name and Created At */}
          <div>
            <h1 className="text-xl font-semibold text-foreground mb-1">
              {apiKey.name || 'Untitled Key'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Created {formatDistanceToNow(new Date(apiKey.createdAt), {addSuffix: true})}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Key Token */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                <FileKey className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Key Token</div>
                <code className="text-sm font-mono font-medium bg-muted px-1.5 py-0.5 rounded">
                  {apiKey.keyPrefix}...{apiKey.keySuffix}
                </code>
              </div>
            </div>

            {/* Created By */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Created By</div>
                <div className="text-sm font-medium truncate">{apiKey.createdByEmail}</div>
              </div>
            </div>

            {/* Created Date */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Created</div>
                <div className="text-sm font-medium">
                  {format(new Date(apiKey.createdAt), 'MMM d, yyyy')}
                </div>
              </div>
            </div>

            {/* Last Used */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Last Used</div>
                <div className="text-sm font-medium">
                  {apiKey.lastUsedAt
                    ? formatDistanceToNow(new Date(apiKey.lastUsedAt), {addSuffix: true})
                    : 'Never'}
                </div>
              </div>
            </div>

            {/* Expires */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                <Timer className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Expires</div>
                <div className={`text-sm font-medium ${isExpired ? 'text-destructive' : ''}`}>
                  {apiKey.expiresAt
                    ? `${format(new Date(apiKey.expiresAt), 'MMM d, yyyy')}${isExpired ? ' (expired)' : ''}`
                    : 'Never'}
                </div>
              </div>
            </div>

            {/* Projects */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Projects</div>
                <div className="text-sm font-medium">
                  {apiKey.projectIds === null
                    ? 'All projects'
                    : `${apiKey.projectIds.length} project${apiKey.projectIds.length !== 1 ? 's' : ''}`}
                </div>
              </div>
            </div>

            {/* Description */}
            {apiKey.description && (
              <div className="flex items-start gap-2.5 sm:col-span-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                  <FileKey className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-0.5">Description</div>
                  <div className="text-sm">{apiKey.description}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scopes */}
      <div className="rounded-lg border bg-card/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Scopes</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(apiKey.scopes as AdminApiKeyScope[]).map(scope => (
            <Badge key={scope} variant="secondary" className="text-xs">
              {scope}
            </Badge>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <h2 className="text-sm font-semibold text-destructive mb-2">Danger Zone</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Deleting this API key will immediately revoke access. This action cannot be undone.
        </p>
        {confirming ? (
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                deleteMutation.mutate({workspaceId, adminApiKeyId: id});
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete API key
          </Button>
        )}
      </div>
    </div>
  );
}

