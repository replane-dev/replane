export function deserializeJson<T>(text: string | null): T | null {
  if (text === null) {
    return null;
  }
  return JSON.parse(text) as T;
}

export function serializeJson<T>(value: T): string {
  return JSON.stringify(value);
}
