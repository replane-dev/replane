// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {InstanceTransferSettings} from './instance-transfer-settings';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('instance transfer settings', () => {
  it('requires a token, file, and confirmation; shows restart instructions after restore', async () => {
    const fetch = vi.fn().mockResolvedValue({ok: true});
    vi.stubGlobal('fetch', fetch);
    render(<InstanceTransferSettings />);
    const restore = screen.getByRole('button', {
      name: 'Replace instance from JSON',
    }) as HTMLButtonElement;
    expect(restore.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Instance transfer token'), {target: {value: 'secret'}});
    const file = new File(['{"format":"replane-instance"}'], 'backup.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByLabelText('Backup JSON file'), {target: {files: [file]}});
    expect(restore.disabled).toBe(true);
    fireEvent.change(
      screen.getByLabelText('Type REPLACE to confirm deletion of all destination data'),
      {target: {value: 'REPLACE'}},
    );
    expect(restore.disabled).toBe(false);
    fireEvent.click(restore);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Restore complete'),
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/instance-transfer?action=import',
      expect.objectContaining({
        method: 'POST',
        body: file,
        headers: expect.objectContaining({
          'x-instance-transfer-token': 'secret',
          'x-confirm-replace-instance': 'replace',
        }),
      }),
    );
    expect(screen.getByRole('status').textContent).toContain(
      'Restart all destination Replane processes',
    );
    expect(restore.disabled).toBe(true);
    expect((screen.getByLabelText('Instance transfer token') as HTMLInputElement).value).toBe('');
  });
  it('shows authorization errors and allows retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          json: async () => ({error: 'Invalid instance transfer token.'}),
        }),
    );
    render(<InstanceTransferSettings />);
    fireEvent.change(screen.getByLabelText('Instance transfer token'), {target: {value: 'wrong'}});
    fireEvent.click(screen.getByRole('button', {name: 'Export instance JSON'}));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Invalid instance transfer token.'),
    );
    expect(
      (screen.getByRole('button', {name: 'Export instance JSON'}) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
