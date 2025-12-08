'use client';

import {ReplaneIcon} from '@/components/replane-icon';
import {SystemStatusCard} from '@/components/system-status-card';
import {UsefulLinks} from '@/components/useful-links';
import Link from 'next/link';
import {useEffect, useState} from 'react';

interface HealthData {
  status: 'ok';
  version: string;
  uptime: number;
  timestamp: string;
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/internal/health');
        if (!response.ok) {
          throw new Error(`Health check failed: ${response.status}`);
        }
        const data = await response.json();
        setHealth(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch health');
        setHealth(null);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);

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
          title="Health"
          description="Basic health check for Replane"
          version={health?.version ?? ''}
          uptime={health?.uptime ?? 0}
          status={health?.status ?? 'ok'}
          loading={loading}
          error={error}
          lastChecked={health?.timestamp}
        />

        <div className="mt-6">
          <UsefulLinks />
        </div>
      </div>
    </div>
  );
}
