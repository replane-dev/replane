'use client';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {CodeSnippet} from '@/components/code-snippet';
import {Dialog, DialogContent} from '@/components/ui/dialog';
import {Separator} from '@/components/ui/separator';
import {AlertCircle, Check, ExternalLink, Loader2} from 'lucide-react';
import Link from 'next/link';

interface ReferenceValuePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configName?: string;
  path?: string;
  previewState: {
    loading: boolean;
    value?: unknown;
    error?: string;
  };
  projectId?: string;
}

export function ReferenceValuePreviewDialog({
  open,
  onOpenChange,
  configName,
  path,
  previewState,
  projectId,
}: ReferenceValuePreviewDialogProps) {
  const hasPath = path && path.length > 0;
  const valueType = previewState.value !== undefined ? typeof previewState.value : undefined;
  const isArray = Array.isArray(previewState.value);
  const isObject = valueType === 'object' && !isArray && previewState.value !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-1">Reference Preview</h2>
              <p className="text-sm text-muted-foreground">Viewing value from referenced config</p>
            </div>
          </div>

          {/* Reference path display */}
          {configName && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs">
                {configName}
              </Badge>
              {hasPath && (
                <>
                  <span className="text-muted-foreground text-xs">→</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {path}
                  </Badge>
                </>
              )}
              {projectId && configName && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs ml-auto" asChild>
                  <Link href={`/app/projects/${projectId}/configs/${configName}`} target="_blank">
                    View Config
                    <ExternalLink className="size-3 ml-1" />
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {previewState.loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="size-8 text-muted-foreground animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">Fetching referenced value...</p>
            </div>
          )}

          {previewState.error && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-destructive/10 text-destructive rounded-full p-3 mb-4">
                <AlertCircle className="size-6" />
              </div>
              <p className="text-sm font-medium mb-1">Unable to fetch value</p>
              <p className="text-sm text-muted-foreground max-w-md">{previewState.error}</p>
            </div>
          )}

          {previewState.value !== undefined && !previewState.error && !previewState.loading && (
            <div className="space-y-4">
              {/* Success indicator with metadata */}
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 rounded-lg">
                <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full p-1.5">
                  <Check className="size-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    Reference resolved successfully
                  </p>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <Badge
                      variant="outline"
                      className="text-xs border-green-300 dark:border-green-800"
                    >
                      {isArray ? 'Array' : isObject ? 'Object' : valueType}
                    </Badge>
                    {isArray && (
                      <Badge
                        variant="outline"
                        className="text-xs border-green-300 dark:border-green-800"
                      >
                        {(previewState.value as any[]).length} items
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Value display */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Value</label>
                  <Badge variant="secondary" className="text-xs">
                    JSON
                  </Badge>
                </div>
                <div className="max-h-[400px] overflow-auto">
                  <CodeSnippet
                    code={JSON.stringify(previewState.value, null, 2)}
                    language="json"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!previewState.loading && (
          <div className="px-6 py-4 border-t bg-muted/20">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
