import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

describe('get-health', () => {
  const fixture = useAppFixture({authEmail: 'test@example.com'});

  it('should get health', async () => {
    const result = await fixture.trpc.getHealth();

    expect(result).toEqual({});
  });
});
