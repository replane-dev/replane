import {describe, expect, it} from 'vitest';
import {useAppFixture} from './trpc-fixture';

describe('get-health', () => {
  const fixture = useAppFixture();

  it('should get health', async () => {
    const result = await fixture.trpc.getHealth();

    expect(result).toEqual({});
  });
});
