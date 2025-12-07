export function deserializeJson<T = unknown>(text: string): T {
  return JSON.parse(text) as T;
}

export function serializeJson(value: unknown): string {
  if (value === undefined) {
    throw new Error('Value must not be undefined');
  }
  return JSON.stringify(value);
}
