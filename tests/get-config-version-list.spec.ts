import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('test@example.com');

describe('getConfigVersionList', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('should list versions in descending order', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'versions-test',
      value: {foo: 1},
      schema: {type: 'object'},
      description: 'initial',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [TEST_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // create version 2
    const configV1 = await fixture.trpc.getConfig({
      name: 'versions-test',
      projectId: fixture.projectId,
    });
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId: configV1.config!.config.id,
      prevVersion: configV1.config!.config.version,
      value: {newValue: {foo: 2}},
      description: {newDescription: 'second'},
      currentUserEmail: TEST_USER_EMAIL,
    });

    // create version 3
    const configV2 = await fixture.trpc.getConfig({
      name: 'versions-test',
      projectId: fixture.projectId,
    });
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId: configV2.config!.config.id,
      prevVersion: configV2.config!.config.version,
      value: {newValue: {foo: 3}},
      description: {newDescription: 'third'},
      currentUserEmail: TEST_USER_EMAIL,
    });

    const {versions} = await fixture.trpc.getConfigVersionList({
      name: 'versions-test',
      projectId: fixture.projectId,
    });

    expect(versions?.map(v => v.version)).toEqual([3, 2, 1]);
    expect(versions?.[0].description).toBe('third');
    // All versions authored by test user in this flow
    expect(new Set(versions?.map(v => v.authorEmail))).toEqual(new Set([TEST_USER_EMAIL]));
  });

  it('returns undefined when config not found', async () => {
    const {versions} = await fixture.trpc.getConfigVersionList({
      name: 'nope',
      projectId: fixture.projectId,
    });
    expect(versions).toBeUndefined();
  });
});
