import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {emailToIdentity, useAppFixture} from './fixtures/app-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('keyget@example.com');

describe('getSdkKey', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('fetches a single key by id', async () => {
    const created = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      name: 'FetchMe',
      description: 'desc',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    const single = await fixture.engine.useCases.getSdkKey(GLOBAL_CONTEXT, {
      id: created.sdkKey.id,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });

    expect(single.sdkKey).toBeTruthy();
    expect(single.sdkKey).toMatchObject({
      id: created.sdkKey.id,
      name: 'FetchMe',
      description: 'desc',
      environmentId: fixture.productionEnvironmentId,
      environmentName: 'Production',
    });
  });

  it('returns null for non-existing key', async () => {
    const single = await fixture.engine.useCases.getSdkKey(GLOBAL_CONTEXT, {
      id: '00000000-0000-0000-0000-000000000000',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });
    expect(single.sdkKey).toBeNull();
  });

  it('returns null after the key is deleted', async () => {
    const created = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      name: 'DeleteThenFetch',
      description: '',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });
    await fixture.engine.useCases.deleteSdkKey(GLOBAL_CONTEXT, {
      id: created.sdkKey.id,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });
    const single = await fixture.engine.useCases.getSdkKey(GLOBAL_CONTEXT, {
      id: created.sdkKey.id,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });
    expect(single.sdkKey).toBeNull();
  });
});
