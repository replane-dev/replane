import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('keylist@example.com');

describe('getSdkKeyList', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('lists multiple keys ordered by createdAt desc', async () => {
    await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      name: 'First',
      description: '',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });
    fixture.setNow(new Date('2020-01-01T00:01:00Z'));
    await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      name: 'Second',
      description: 'second desc',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    const list = await fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });

    expect(list.sdkKeys.map(k => k.name)).toEqual(['Second', 'First']);
  });

  it('updates list after deletion', async () => {
    const created = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      name: 'Temp',
      description: '',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });
    let list = await fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });
    expect(list.sdkKeys.some(k => k.id === created.sdkKey.id)).toBe(true);

    await fixture.engine.useCases.deleteSdkKey(GLOBAL_CONTEXT, {
      id: created.sdkKey.id,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });

    list = await fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });
    expect(list.sdkKeys.some(k => k.id === created.sdkKey.id)).toBe(false);
  });
});
