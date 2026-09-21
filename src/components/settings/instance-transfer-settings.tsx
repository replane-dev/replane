'use client';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {useState} from 'react';

export function InstanceTransferSettings() {
  const [token, setToken] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [restored, setRestored] = useState(false);

  async function transfer(action: 'export' | 'import') {
    setBusy(true);
    setMessage('');
    try {
      if (action === 'import' && (!file || file.size > 100 * 1024 * 1024))
        throw new Error('Select a JSON backup up to 100 MiB.');
      const response = await fetch(`/api/instance-transfer?action=${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-instance-transfer-token': token,
          'x-confirm-replace-instance': confirmation === 'REPLACE' ? 'replace' : '',
        },
        body: action === 'import' ? file : undefined,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Instance transfer is unavailable.');
      }
      if (action === 'export') {
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = `replane-instance-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage(
          'Backup downloaded. Store it securely: it contains credentials and private configuration.',
        );
      } else {
        setRestored(true);
        setToken('');
        setMessage(
          'Restore complete. Restart all destination Replane processes before use, then sign in with an imported account.',
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transfer failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">Instance backup & restore</h2>
        <p className="text-sm text-muted-foreground">
          Transfer all workspaces, projects, configs, members, users, API keys, history, and
          database settings.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="instance-token">Instance transfer token</Label>
        <Input
          id="instance-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={e => setToken(e.target.value)}
          disabled={busy || restored}
        />
        <p className="text-sm text-muted-foreground">
          Enter the INSTANCE_TRANSFER_TOKEN configured by your instance operator.
        </p>
      </div>
      <Button disabled={busy || restored || !token} onClick={() => transfer('export')}>
        Export instance JSON
      </Button>
      <div className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">Replace this instance</h3>
        <p className="text-sm">
          Import permanently replaces all destination data, including users. Use the same Replane
          version on both instances. Stop writes on the source before the final export and keep
          destination traffic stopped until all destination processes have restarted after import.
        </p>
        <p className="text-sm text-muted-foreground">
          Environment variables are not included. Configure authentication providers on the
          destination and use a fresh SECRET_KEY to invalidate previous sessions. Backups contain
          sensitive credentials. Maximum file size: 100 MiB.
        </p>
        <Label htmlFor="instance-backup">Backup JSON file</Label>
        <Input
          id="instance-backup"
          type="file"
          accept="application/json,.json"
          disabled={busy || restored}
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
        <Label htmlFor="instance-confirmation">
          Type REPLACE to confirm deletion of all destination data
        </Label>
        <Input
          id="instance-confirmation"
          value={confirmation}
          disabled={busy || restored}
          onChange={e => setConfirmation(e.target.value)}
        />
        <Button
          variant="destructive"
          disabled={busy || restored || !token || !file || confirmation !== 'REPLACE'}
          onClick={() => transfer('import')}
        >
          {busy ? 'Transferring…' : 'Replace instance from JSON'}
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
