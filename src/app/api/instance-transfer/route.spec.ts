import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {POST} from './route';

const mocks = vi.hoisted(() => ({
  exportInstance: vi.fn(),
  importInstance: vi.fn(),
  getPgPool: vi.fn(),
  free: vi.fn(),
}));
vi.mock('@/engine/core/instance-transfer', async importOriginal => ({
  ...(await importOriginal<typeof import('@/engine/core/instance-transfer')>()),
  exportInstance: mocks.exportInstance,
  importInstance: mocks.importInstance,
}));
vi.mock('@/engine/core/pg-pool-cache', () => ({getPgPool: mocks.getPgPool}));

function request(action: string, token?: string, body?: string, confirm = 'replace') {
  return new Request(`http://localhost/api/instance-transfer?action=${action}`, {
    method: 'POST',
    headers: {
      ...(token ? {'x-instance-transfer-token': token} : {}),
      'x-confirm-replace-instance': confirm,
    },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv('INSTANCE_TRANSFER_TOKEN', 'operator-secret');
  vi.stubEnv('DATABASE_URL', 'postgresql://unused');
  mocks.getPgPool.mockReturnValue([{}, mocks.free]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('instance transfer endpoint', () => {
  it('is unavailable without the environment variable', async () => {
    vi.stubEnv('INSTANCE_TRANSFER_TOKEN', '');
    expect((await POST(request('export', 'operator-secret'))).status).toBe(404);
    expect(mocks.getPgPool).not.toHaveBeenCalled();
  });
  it('denies missing and wrong tokens before touching the database', async () => {
    for (const token of [undefined, 'wrong']) {
      expect((await POST(request('export', token))).status).toBe(403);
      expect((await POST(request('import', token, '{}'))).status).toBe(403);
    }
    expect(mocks.getPgPool).not.toHaveBeenCalled();
  });
  it('requires explicit replacement confirmation and valid JSON', async () => {
    expect((await POST(request('import', 'operator-secret', '{}', ''))).status).toBe(400);
    expect((await POST(request('import', 'operator-secret', 'not json'))).status).toBe(400);
    expect(mocks.importInstance).not.toHaveBeenCalled();
  });
  it('downloads uncached JSON and releases the pool reference', async () => {
    mocks.exportInstance.mockResolvedValue({format: 'replane-instance'});
    const response = await POST(request('export', 'operator-secret'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toContain('attachment;');
    expect(await response.json()).toEqual({format: 'replane-instance'});
    expect(mocks.free).toHaveBeenCalledOnce();
  });
  it('imports only after confirmation and does not leak database errors', async () => {
    mocks.importInstance.mockRejectedValue(new Error('private database credentials'));
    const response = await POST(request('import', 'operator-secret', '{"format":"test"}'));
    expect(response.status).toBe(500);
    expect(mocks.importInstance).toHaveBeenCalledWith({}, {format: 'test'}, 'public');
    expect(await response.text()).not.toContain('private database credentials');
    expect(mocks.free).toHaveBeenCalledOnce();
  });
});
