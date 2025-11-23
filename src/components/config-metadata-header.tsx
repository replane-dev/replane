'use client';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {format, formatDistanceToNow} from 'date-fns';
import {CalendarDays, Clock3, Copy, GitBranch, GitCommitVertical} from 'lucide-react';
import Link from 'next/link';
import {toast} from 'sonner';

function formatTimezoneOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  return `UTC${sign}${hours}${minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : ''}`;
}

interface ConfigMetadataHeaderProps {
  name: string;
  version?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  pendingProposalsCount?: number;
  versionsLink?: string;
  projectId: string;
}

export function ConfigMetadataHeader({
  name,
  version,
  createdAt,
  updatedAt,
  pendingProposalsCount,
  versionsLink,
  projectId,
}: ConfigMetadataHeaderProps) {
  return (
    <div className="space-y-2">
      <div className="group flex items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">{name}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={async () => {
                await navigator.clipboard.writeText(name);
                toast.success('Copied config name', {description: name});
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy config name</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {typeof pendingProposalsCount === 'number' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`/app/projects/${projectId}/configs/${encodeURIComponent(name)}/proposals`}
                className="inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-3 py-1.5 text-sm hover:bg-card/80 transition-colors"
              >
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{pendingProposalsCount}</span>
                <span className="text-muted-foreground">proposals</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {pendingProposalsCount === 1
                ? '1 pending proposal waiting for review'
                : `${pendingProposalsCount} pending proposals waiting for review`}
            </TooltipContent>
          </Tooltip>
        )}

        {typeof version === 'number' && versionsLink && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={versionsLink}
                className="inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-3 py-1.5 text-sm hover:bg-card/80 transition-colors"
              >
                <GitCommitVertical className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">v{version}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Config version {version}. Click to view version history.
            </TooltipContent>
          </Tooltip>
        )}
        {typeof version === 'number' && !versionsLink && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-3 py-1.5 text-sm cursor-help">
                <GitCommitVertical className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">v{version}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Config version {version}. The version number increments each time the config is updated.
            </TooltipContent>
          </Tooltip>
        )}

        {(() => {
          const c = createdAt ? new Date(createdAt) : undefined;
          const u = updatedAt ? new Date(updatedAt) : undefined;
          const hasC = !!c && !isNaN(c.getTime());
          const hasU = !!u && !isNaN(u.getTime());
          const showU = hasU && (!hasC || u!.getTime() !== c!.getTime());

          return (
            <>
              {hasC && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-3 py-1.5 text-sm cursor-help">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Created</span>
                      <span className="font-medium">{formatDistanceToNow(c!, {addSuffix: true})}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <span>
                      {format(c!, 'yyyy-MM-dd HH:mm:ss')} {formatTimezoneOffset(c!)}
                    </span>
                  </TooltipContent>
                </Tooltip>
              )}

              {showU && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-3 py-1.5 text-sm cursor-help">
                      <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Updated</span>
                      <span className="font-medium">{formatDistanceToNow(u!, {addSuffix: true})}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <span>
                      {format(u!, 'yyyy-MM-dd HH:mm:ss')} {formatTimezoneOffset(u!)}
                    </span>
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

