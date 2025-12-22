'use client';

import {useDismissible} from '@/hooks/use-dismissible';
import {cn} from '@/lib/utils';
import {useReplaneConfig} from '@/replane/hooks';
import {AlertTriangle, CheckCircle, ExternalLink, Megaphone, X, XCircle} from 'lucide-react';

const variantIcons = {
  info: Megaphone,
  warning: AlertTriangle,
  success: CheckCircle,
  error: XCircle,
};

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
  const Icon = variantIcons[variant];

  return (
    <div className="px-2 pb-2">
      <div
        className={cn(
          'rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 py-2.5',
          'transition-colors hover:bg-sidebar-accent',
        )}
      >
        <div className="flex gap-2.5">
          <Icon
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0',
              variant === 'error' && 'text-destructive',
              variant === 'warning' && 'text-amber-500 dark:text-amber-400',
              variant === 'success' && 'text-emerald-600 dark:text-emerald-400',
              variant === 'info' && 'text-sidebar-foreground/70',
            )}
          />
          <div className="flex-1 min-w-0">
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
          <button
            onClick={dismiss}
            className={cn(
              'shrink-0 rounded p-0.5 -m-0.5',
              'text-sidebar-foreground/50 hover:text-sidebar-foreground',
              'hover:bg-sidebar-accent transition-colors',
            )}
            aria-label="Dismiss announcement"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
