import assert from 'node:assert';

export function ensureDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }

  return value;
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('Chunk size must be greater than 0');
  }

  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function assertNever(value: never, message: string): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

export function trimEnd(source: string, str: string): string {
  assert(str.length > 0, 'trimEnd string must not be empty');

  let result = source;

  while (result.endsWith(str)) {
    result = result.slice(0, -str.length);
  }

  return result;
}

export function getDaysAgo(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

export function getStartOfNextUtcDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

export function getStartOfUtcDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

export async function mapConcurrently<T, R>(options: {
  items: T[];
  concurrencyLimit: number;
  map: (item: T) => Promise<R>;
}): Promise<R[]> {
  const {items, concurrencyLimit, map} = options;

  assert(concurrencyLimit > 0, 'Concurrency limit must be greater than 0');

  const results: R[] = new Array<R>(items.length);
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    const p = (async () => {
      const r = await map(items[i]);
      results[i] = r;
    })().finally(() => {
      executing.delete(p);
    });

    executing.add(p);

    if (executing.size >= concurrencyLimit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}
