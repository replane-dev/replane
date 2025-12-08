'use client';

import {Activity, CheckCircle2, Clock, Database, Server, XCircle} from 'lucide-react';
import {Badge} from './ui/badge';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from './ui/card';

export interface StatusCheck {
  status: 'ok' | 'error';
  error?: string;
}

export interface SystemStatusCardProps {
  title: string;
  description: string;
  version: string;
  uptime: number;
  status: 'ok' | 'degraded';
  checks?: {
    database?: StatusCheck;
  };
  loading?: boolean;
  error?: string | null;
  lastChecked?: string;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

export function SystemStatusCard({
  title,
  description,
  version,
  uptime,
  status,
  checks,
  loading,
  error,
  lastChecked,
}: SystemStatusCardProps) {
  const isHealthy = status === 'ok';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Activity className="size-6" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {!loading && (
            <Badge
              variant={isHealthy ? 'default' : 'destructive'}
              className={isHealthy ? 'bg-green-600 hover:bg-green-600' : ''}
            >
              {isHealthy ? (
                <>
                  <CheckCircle2 className="size-3" />
                  Healthy
                </>
              ) : (
                <>
                  <XCircle className="size-3" />
                  {status === 'degraded' ? 'Degraded' : 'Unhealthy'}
                </>
              )}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Checking status...</div>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="size-5" />
              <span className="font-medium">Check Failed</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Server className="size-4" />
                  Version
                </div>
                <div className="mt-1 text-lg font-semibold">{version}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-4" />
                  Uptime
                </div>
                <div className="mt-1 text-lg font-semibold">{formatUptime(uptime)}</div>
              </div>
            </div>

            {checks?.database && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Service Checks</div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="size-4 text-muted-foreground" />
                      <span>Database</span>
                    </div>
                    <Badge
                      variant={checks.database.status === 'ok' ? 'default' : 'destructive'}
                      className={
                        checks.database.status === 'ok' ? 'bg-green-600 hover:bg-green-600' : ''
                      }
                    >
                      {checks.database.status === 'ok' ? (
                        <>
                          <CheckCircle2 className="size-3" />
                          Connected
                        </>
                      ) : (
                        <>
                          <XCircle className="size-3" />
                          Error
                        </>
                      )}
                    </Badge>
                  </div>
                  {checks.database.error && (
                    <p className="mt-2 text-sm text-destructive">{checks.database.error}</p>
                  )}
                </div>
              </div>
            )}

            {lastChecked && (
              <div className="text-xs text-muted-foreground">
                Last checked: {new Date(lastChecked).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
