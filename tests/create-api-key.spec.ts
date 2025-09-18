import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('keycreate@example.com');

describe('createApiKey', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('creates an api key and returns one-time token', async () => {
    const result = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'Primary Key',
      description: 'Main key',
      projectId: fixture.projectId,
    });

    // Expect format: cm_<80 hex chars> (24 random bytes + 16 uuid bytes)
    expect(result.apiKey.token).toMatch(/^rp_[a-f0-9]{80}$/i);
    expect(result.apiKey.name).toBe('Primary Key');
    expect(result.apiKey.description).toBe('Main key');
  });

  it('returns different tokens for each creation and persists only metadata', async () => {
    const first = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'K1',
      description: '',
      projectId: fixture.projectId,
    });
    const second = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'K2',
      description: '',
      projectId: fixture.projectId,
    });
    expect(first.apiKey.token).not.toBe(second.apiKey.token);

    const list = await fixture.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });
    // list entries never include full token
    const anyWithToken = list.apiKeys.some(k => (k as any).token);
    expect(anyWithToken).toBe(false);
  });

  it('creates audit message (api_key_created)', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'Audit Key',
      description: 'audit',
      projectId: fixture.projectId,
    });

    const messages = await fixture.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 10,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    expect(messages.length).toBe(2);
    const payload: any = messages[0].payload;
    expect(payload.type).toBe('api_key_created');
    expect(payload.apiKey.id).toBe(created.apiKey.id);
    expect(payload.apiKey.name).toBe('Audit Key');
    expect(payload.apiKey.description).toBe('audit');
    // token must not be present in stored payload
    expect(payload.apiKey.token).toBeUndefined();
  });
});
