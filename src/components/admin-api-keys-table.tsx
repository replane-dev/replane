'use client';

import {useMutation, useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import {ChevronRight, KeyRound, MoreHorizontal, Plus} from 'lucide-react';
import * as React from 'react';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Input} from '@/components/ui/input';
import type {AdminApiKeyScope} from '@/engine/core/identity';
import {useTRPC} from '@/trpc/client';
import {formatDistanceToNow} from 'date-fns';
import {toast} from 'sonner';

interface AdminApiKeyRow {
  id: string;
  name: string;
  description: string;
  keyPrefix: string;
  keySuffix: string;
  createdByEmail: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  scopes: AdminApiKeyScope[];
  projectIds: string[] | null;
}

export interface AdminApiKeysTableProps {
  workspaceId: string;
  onApiKeyClick?: (id: string) => void;
  onNewApiKeyClick?: () => void;
}

export function AdminApiKeysTable({
  workspaceId,
  onApiKeyClick,
  onNewApiKeyClick,
}: AdminApiKeysTableProps) {
  const qc = useQueryClient();
  const trpc = useTRPC();
  const [search, setSearch] = React.useState('');

  const deleteMutation = useMutation(
    trpc.deleteAdminApiKey.mutationOptions({
      onSuccess: async () => {
        const key = trpc.listAdminApiKeys.queryKey();
        await qc.invalidateQueries({queryKey: key});
        toast.success('API key deleted');
      },
      onError: err => {
        toast.error(err?.message ?? 'Failed to delete API key');
      },
    }),
  );

  const {
    data: {adminApiKeys},
  } = useSuspenseQuery(trpc.listAdminApiKeys.queryOptions({workspaceId}));

  const filteredKeys = React.useMemo(() => {
    if (!search.trim()) return adminApiKeys as AdminApiKeyRow[];
    const lower = search.toLowerCase();
    return (adminApiKeys as AdminApiKeyRow[]).filter(
      k =>
        k.name?.toLowerCase().includes(lower) ||
        k.keyPrefix?.toLowerCase().includes(lower) ||
        k.description?.toLowerCase().includes(lower),
    );
  }, [adminApiKeys, search]);

  // Empty state
  if (adminApiKeys.length === 0) {
    return (
      <div className="w-full">
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <div className="rounded-full bg-muted/50 p-4 mb-6">
            <KeyRound className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No API keys yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            API keys allow programmatic access to your workspace. Create an API key to integrate
            with CI/CD pipelines or other automation tools.
          </p>
          {onNewApiKeyClick && (
            <Button onClick={onNewApiKeyClick}>
              <Plus className="mr-2 h-4 w-4" />
              Create API key
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search API keys..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1"
        />
        {onNewApiKeyClick && (
          <Button onClick={onNewApiKeyClick} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New
          </Button>
        )}
      </div>

      {/* List */}
      <div className="rounded-md border divide-y">
        {filteredKeys.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No API keys match your search
          </div>
        ) : (
          filteredKeys.map(apiKey => {
            const isExpired = apiKey.expiresAt ? new Date(apiKey.expiresAt) < new Date() : false;
            return (
              <div
                key={apiKey.id}
                className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => onApiKeyClick?.(apiKey.id)}
              >
                {/* Icon */}
                <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted/50 shrink-0">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {apiKey.name || 'Untitled Key'}
                    </span>
                    {isExpired && (
                      <Badge variant="destructive" className="text-xs shrink-0">
                        Expired
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <code className="bg-muted px-1 py-0.5 rounded font-mono">
                      {apiKey.keyPrefix}...{apiKey.keySuffix}
                    </code>
                    <span>•</span>
                    <span>
                      {apiKey.scopes.length} scope{apiKey.scopes.length !== 1 ? 's' : ''}
                    </span>
                    <span>•</span>
                    <span>
                      {formatDistanceToNow(new Date(apiKey.createdAt), {addSuffix: true})}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={e => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(apiKey.keyPrefix);
                        toast.success('Key prefix copied');
                      }}
                    >
                      Copy key prefix
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-700"
                      disabled={deleteMutation.isPending}
                      onClick={async e => {
                        e.stopPropagation();
                        if (confirm(`Delete API key "${apiKey.name}"? This cannot be undone.`)) {
                          try {
                            await deleteMutation.mutateAsync({
                              workspaceId,
                              adminApiKeyId: apiKey.id,
                            });
                          } catch {
                            // handled in onError
                          }
                        }
                      }}
                    >
                      {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Chevron */}
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
