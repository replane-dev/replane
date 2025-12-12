'use client';

import {AuditEventDisplay} from '@/components/audit-event-display';
import {JsonEditor} from '@/components/json-editor';
import {Badge} from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import type {AuditLogPayload} from '@/engine/core/stores/audit-log-store';
import {isValidUuid} from '@/engine/core/utils';
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {format, formatDistanceToNow} from 'date-fns';
import {Calendar, FileText, User} from 'lucide-react';
import Link from 'next/link';
import {notFound, useParams} from 'next/navigation';
import {Fragment, useMemo} from 'react';
import {useProjectId} from '../../utils';

export default function AuditLogMessagePage() {
  const {id} = useParams<{id: string}>();

  // Validate UUID format before making any requests
  if (!isValidUuid(id)) {
    notFound();
  }

  const trpc = useTRPC();
  const {data} = useSuspenseQuery(trpc.getAuditLogMessage.queryOptions({id}));
  const message = data.message;
  const projectId = useProjectId();

  // Trigger 404 page if message doesn't exist
  if (!message) {
    notFound();
  }

  const payloadJson = useMemo(() => JSON.stringify(message.payload, null, 2), [message]);

  return (
    <Fragment>
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link href={`/app/projects/${projectId}/audit-log`}>Audit Log</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{id}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-4xl space-y-6">
          {/* Message Info */}
          <div className="rounded-lg border bg-card/50 p-4">
            <div className="space-y-4">
              {/* Type Badge */}
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-medium">
                  {(() => {
                    const payload = message.payload as {type?: string};
                    const type = payload.type ?? 'unknown';
                    return type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                  })()}
                </Badge>
                {message.configName && (
                  <Link
                    href={`/app/projects/${projectId}/configs/${encodeURIComponent(message.configName)}`}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    Config: {message.configName}
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Timestamp */}
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Timestamp</div>
                    <div className="text-sm font-medium">
                      {formatDistanceToNow(new Date(message.createdAt), {addSuffix: true})}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(message.createdAt), 'PPpp')}
                    </div>
                  </div>
                </div>

                {/* User */}
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">User</div>
                    <div className="text-sm font-medium break-all">
                      {message.userEmail ?? 'System'}
                    </div>
                  </div>
                </div>

                {/* Message ID */}
                <div className="flex items-center gap-2.5 sm:col-span-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Message ID</div>
                    <div className="text-sm font-mono font-medium break-all">{message.id}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Event Details */}
          <div className="rounded-lg border bg-card/50 p-6">
            <AuditEventDisplay payload={message.payload as AuditLogPayload} projectId={projectId} />
          </div>
          <div className="mt-4 rounded-lg border bg-card/50 overflow-hidden">
            <div className="border-b bg-muted/30 px-6 py-3">
              <span className="text-sm font-medium text-muted-foreground">Log payload</span>
            </div>
            <div className="p-6">
              <JsonEditor
                id={`audit-message-${message.id}`}
                editorName="Audit Log Payload"
                aria-label="Audit log message payload JSON"
                value={payloadJson}
                onChange={() => {}}
                readOnly
                height={400}
              />
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}
