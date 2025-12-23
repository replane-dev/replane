import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

describe('get-health', () => {
  const fixture = useAppFixture({authEmail: 'test@example.com'});

  it('should get health', async () => {
    const result = await fixture.trpc.getHealth();

    expect(result).toEqual({
      status: 'ok',
      version: expect.any(String),
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    });
  });
});
