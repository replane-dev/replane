import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('keyget@example.com');

describe('getApiKey', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('fetches a single key by id', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'FetchMe',
      description: 'desc',
      projectId: fixture.projectId,
    });

    const single = await fixture.engine.useCases.getApiKey(GLOBAL_CONTEXT, {
      id: created.apiKey.id,
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });

    expect(single.apiKey).toBeTruthy();
    expect(single.apiKey).toMatchObject({
      id: created.apiKey.id,
      name: 'FetchMe',
      description: 'desc',
    });
  });

  it('returns null for non-existing key', async () => {
    const single = await fixture.engine.useCases.getApiKey(GLOBAL_CONTEXT, {
      id: '00000000-0000-0000-0000-000000000000',
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });
    expect(single.apiKey).toBeNull();
  });

  it('returns null after the key is deleted', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'DeleteThenFetch',
      description: '',
      projectId: fixture.projectId,
    });
    await fixture.engine.useCases.deleteApiKey(GLOBAL_CONTEXT, {
      id: created.apiKey.id,
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });
    const single = await fixture.engine.useCases.getApiKey(GLOBAL_CONTEXT, {
      id: created.apiKey.id,
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });
    expect(single.apiKey).toBeNull();
  });
});
