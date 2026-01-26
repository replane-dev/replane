'use client';

import {SdkIntegrationGuide} from '@/components/sdk-integration-guide';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {isValidUuid} from '@/engine/core/utils';
import {useTRPC} from '@/trpc/client';
import {useMutation, useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import {format, formatDistanceToNow} from 'date-fns';
import {AlignLeft, CalendarDays, FileKey, Globe, Pencil, Trash2} from 'lucide-react';
import {notFound} from 'next/navigation';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';

export interface SdkKeyDetailViewProps {
  id: string;
  projectId: string;
  onDelete?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function SdkKeyDetailView({id, projectId, onDelete, onDirtyChange}: SdkKeyDetailViewProps) {
  // Validate UUID format before making any requests
  if (!isValidUuid(id)) {
    notFound();
  }

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const {data} = useSuspenseQuery(trpc.getSdkKeyPageData.queryOptions({id, projectId}));
  const deleteMutation = useMutation(trpc.deleteSdkKey.mutationOptions());
  const updateMutation = useMutation(trpc.updateSdkKey.mutationOptions());
  const sdkKey = data.sdkKey;
  const [confirming, setConfirming] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(sdkKey?.description ?? '');

  // Keep editedDescription in sync with sdkKey.description when not editing
  useEffect(() => {
    if (!isEditingDescription && sdkKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditedDescription(sdkKey.description ?? '');
    }
  }, [sdkKey, isEditingDescription]);

  // Notify parent about dirty state
  useEffect(() => {
    if (onDirtyChange) {
      const isDirty = isEditingDescription && editedDescription !== (sdkKey?.description ?? '');
      onDirtyChange(isDirty);
    }
  }, [isEditingDescription, editedDescription, sdkKey?.description, onDirtyChange]);

  // Trigger 404 page if SDK key doesn't exist
  if (!sdkKey) {
    notFound();
  }

  const handleSaveDescription = async () => {
    try {
      await updateMutation.mutateAsync({
        id,
        projectId,
        description: editedDescription,
      });
      await queryClient.invalidateQueries({
        queryKey: trpc.getSdkKeyPageData.queryKey({id, projectId}),
      });
      setIsEditingDescription(false);
      toast.success('Description updated');
    } catch (e) {
      console.error(e);
      toast.error('Unable to update description — please try again');
    }
  };

  const handleCancelEdit = () => {
    setEditedDescription(sdkKey.description ?? '');
    setIsEditingDescription(false);
  };

  return (
    <div className="space-y-6">
      {/* SDK Key Details */}
      <div className="rounded-lg border bg-card/50 p-4">
        <div className="space-y-4">
          {/* Name and Created At */}
          <div>
            <h1 className="text-xl font-semibold text-foreground mb-1">
              {sdkKey.name || 'Untitled Key'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Created {formatDistanceToNow(new Date(sdkKey.createdAt), {addSuffix: true})}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Environment */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Environment</div>
                <div className="text-sm font-medium">{sdkKey.environmentName}</div>
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
                  {format(new Date(sdkKey.createdAt), 'MMM d, yyyy')}
                </div>
              </div>
            </div>

            {/* Key Token */}
            <div className="flex items-center gap-2.5 sm:col-span-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                <FileKey className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Key Token</div>
                <code className="text-sm font-mono font-medium bg-muted px-1.5 py-0.5 rounded">
                  {sdkKey.keyPrefix}...{sdkKey.keySuffix}
                </code>
              </div>
            </div>

            {/* Description */}
            <div className="flex items-start gap-2.5 sm:col-span-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0 mt-0.5">
                <AlignLeft className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="text-xs text-muted-foreground">Description</div>
                  {!isEditingDescription && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4"
                          onClick={() => setIsEditingDescription(true)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit description</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {isEditingDescription ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editedDescription}
                      onChange={e => setEditedDescription(e.target.value)}
                      placeholder="Add a description..."
                      className="min-h-[80px] text-sm"
                      maxLength={1000}
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveDescription}
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? 'Saving…' : <>Save</>}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                        disabled={updateMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {editedDescription.length}/1000
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-medium whitespace-pre-wrap wrap-break-word">
                    {sdkKey.description || (
                      <span className="text-muted-foreground italic">No description</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Section */}
      <div className="rounded-lg border border-red-200/50 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/20 p-4">
        <div className="flex items-start gap-3">
          <Trash2 className="size-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground mb-2">Danger zone</div>
            {!confirming ? (
              <>
                <p className="text-sm text-foreground/80 dark:text-foreground/70 mb-3">
                  Once you delete an SDK key, all applications using it will immediately lose
                  access. This action cannot be undone.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setConfirming(true)}
                  className="text-destructive hover:text-destructive"
                >
                  Delete SDK Key
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-foreground/80 dark:text-foreground/70">
                  This action{' '}
                  <span className="font-semibold text-destructive">cannot be undone</span>. Are you
                  sure?
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                    onClick={async () => {
                      try {
                        await deleteMutation.mutateAsync({id, projectId});
                        toast.success('SDK key deleted');
                        if (onDelete) {
                          onDelete();
                        }
                      } catch (e) {
                        console.error(e);
                        toast.error('Unable to delete SDK key — please try again');
                      }
                    }}
                  >
                    {deleteMutation.isPending ? 'Deleting…' : 'Confirm Delete'}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SDK Integration Guide */}
      <div className="rounded-lg border bg-card/50 overflow-hidden">
        <div className="border-b bg-muted/30 px-6 py-4">
          <h3 className="text-base font-semibold text-foreground">SDK Integration</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Use these code examples to integrate Replane into your application.
          </p>
        </div>
        <div className="p-6">
          <SdkIntegrationGuide
            sdkKey={null}
            projectId={projectId}
            environmentId={sdkKey.environmentId}
          />
        </div>
      </div>
    </div>
  );
}
