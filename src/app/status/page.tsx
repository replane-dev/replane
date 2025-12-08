'use client';

import {ReplaneIcon} from '@/components/replane-icon';
import {SystemStatusCard, type StatusCheck} from '@/components/system-status-card';
import {UsefulLinks} from '@/components/useful-links';
import Link from 'next/link';
import {useEffect, useState} from 'react';

interface StatusData {
  status: 'ok' | 'degraded';
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: StatusCheck;
  };
}

export default function StatusPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/internal/status');
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }
        const data = await response.json();
        setStatus(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch status');
        setStatus(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-muted min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <ReplaneIcon className="size-4" />
            </div>
            Replane
          </Link>
        </div>

        <SystemStatusCard
          title="System Status"
          description="Current health and status of Replane services"
          version={status?.version ?? ''}
          uptime={status?.uptime ?? 0}
          status={status?.status ?? 'ok'}
          checks={status?.checks}
          loading={loading}
          error={error}
          lastChecked={status?.timestamp}
        />

        <div className="mt-6">
          <UsefulLinks />
        </div>
      </div>
    </div>
  );
}
