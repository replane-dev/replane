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
    });

    expect(result.apiKey.token).toMatch(/^cm_[a-f0-9]{48}$/);
    expect(result.apiKey.name).toBe('Primary Key');
    expect(result.apiKey.description).toBe('Main key');
  });

  it('returns different tokens for each creation and persists only metadata', async () => {
    const first = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'K1',
      description: '',
    });
    const second = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'K2',
      description: '',
    });
    expect(first.apiKey.token).not.toBe(second.apiKey.token);

    const list = await fixture.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
    });
    // list entries never include full token
    const anyWithToken = list.apiKeys.some(k => (k as any).token);
    expect(anyWithToken).toBe(false);
  });
});
