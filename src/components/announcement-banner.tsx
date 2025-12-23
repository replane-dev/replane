'use client';

import {useDismissible} from '@/hooks/use-dismissible';
import {cn} from '@/lib/utils';
import {useReplaneConfig} from '@/replane/hooks';
import {ExternalLink, X} from 'lucide-react';

/**
 * Announcement banner component that displays messages from Replane config.
 * Shows in the sidebar when enabled via the `announcement-banner` config.
 * Users can dismiss the announcement, and it will reappear when the content changes.
 */
export function AnnouncementBanner() {
  const config = useReplaneConfig('announcement-banner');

  const {isDismissed, dismiss} = useDismissible({
    storageKey: 'announcement',
    content: {
      message: config.message,
      linkUrl: config.linkUrl,
      linkText: config.linkText,
      variant: config.variant,
    },
    enabled: config.enabled && !!config.message,
  });

  if (isDismissed) {
    return null;
  }

  const variant = config.variant ?? 'info';

  return (
    <div className="px-2 pb-2">
      <div
        className={cn(
          'relative rounded-md border px-3 py-2.5 pr-8',
          'transition-colors',
          variant === 'info' && 'border-sidebar-border bg-sidebar-accent/50 hover:bg-sidebar-accent',
          variant === 'warning' &&
            'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 dark:border-amber-400/30 dark:bg-amber-400/10 dark:hover:bg-amber-400/15',
          variant === 'success' &&
            'border-emerald-600/30 bg-emerald-600/10 hover:bg-emerald-600/15 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:hover:bg-emerald-400/15',
          variant === 'error' &&
            'border-destructive/30 bg-destructive/10 hover:bg-destructive/15',
        )}
      >
        <button
          onClick={dismiss}
          className={cn(
            'absolute top-1.5 right-1.5 rounded p-0.5',
            'text-sidebar-foreground/50 hover:text-sidebar-foreground',
            'hover:bg-black/5 dark:hover:bg-white/10 transition-colors',
          )}
          aria-label="Dismiss announcement"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0">
          <p className="text-sm leading-relaxed text-sidebar-foreground/90">{config.message}</p>
          {config.linkUrl && (
            <a
              href={config.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'mt-1 inline-flex items-center gap-1 text-sm font-medium',
                'text-sidebar-foreground/70 hover:text-sidebar-foreground',
                'underline-offset-4 hover:underline transition-colors',
              )}
            >
              {config.linkText ?? 'Learn more'}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
