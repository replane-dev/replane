import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('keylist@example.com');

describe('getApiKeyList', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('lists multiple keys ordered by createdAt desc', async () => {
    await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'First',
      description: '',
      projectId: fixture.projectId,
    });
    fixture.setNow(new Date('2020-01-01T00:01:00Z'));
    await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'Second',
      description: 'second desc',
      projectId: fixture.projectId,
    });

    const list = await fixture.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });

    expect(list.apiKeys.map(k => k.name)).toEqual(['Second', 'First']);
    expect(list.apiKeys.every(k => k.creatorEmail === CURRENT_USER_EMAIL)).toBe(true);
  });

  it('updates list after deletion', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'Temp',
      description: '',
      projectId: fixture.projectId,
    });
    let list = await fixture.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });
    expect(list.apiKeys.some(k => k.id === created.apiKey.id)).toBe(true);

    await fixture.engine.useCases.deleteApiKey(GLOBAL_CONTEXT, {
      id: created.apiKey.id,
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });

    list = await fixture.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });
    expect(list.apiKeys.some(k => k.id === created.apiKey.id)).toBe(false);
  });
});
