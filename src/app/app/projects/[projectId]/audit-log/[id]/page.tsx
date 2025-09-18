'use client';

import {JsonEditor} from '@/components/json-editor';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {Calendar, FileText, User} from 'lucide-react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {Fragment, useMemo} from 'react';
import {useProjectId} from '../../utils';

export default function AuditLogMessagePage() {
  const {id} = useParams<{id: string}>();
  const trpc = useTRPC();
  const {data} = useSuspenseQuery(trpc.getAuditLogMessage.queryOptions({id}));
  const message = data.message;

  const meta = useMemo(() => {
    if (!message) return null;
    const createdAt = new Date(message.createdAt);
    const full = createdAt.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
    return {full};
  }, [message]);

  const payloadJson = useMemo(
    () => (message ? JSON.stringify(message.payload, null, 2) : ''),
    [message],
  );
  const projectId = useProjectId();

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
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0 max-w-4xl">
        {!message && (
          <Card>
            <CardContent className="p-6">Audit log message not found.</CardContent>
          </Card>
        )}
        {message && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Audit Log Message
              </CardTitle>
              <CardDescription>
                <div className="pt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1">
                    <Calendar className="h-3 w-3" /> {meta?.full}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1">
                    <User className="h-3 w-3" /> {message.userEmail ?? 'Unknown user'}
                  </span>
                  {message.configName && (
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1">
                      Config: {message.configName}
                    </span>
                  )}
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h2 className="font-semibold mb-2">Payload</h2>
                <JsonEditor
                  id={`audit-message-${message.id}`}
                  aria-label="Audit log message payload JSON"
                  value={payloadJson}
                  onChange={() => {}}
                  readOnly
                  height={360}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Fragment>
  );
}
