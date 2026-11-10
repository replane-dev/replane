export function editorsToJson(editors: string[]): string {
  return JSON.stringify(
    editors.filter(email => email.trim() !== ''),
    null,
    2,
  );
}

/**
 * Returns null when the text isn't a JSON array of strings.
 * Emails themselves are not validated here; the config form schema reports those errors.
 */
export function parseEditorsJson(text: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.every(item => typeof item === 'string')) {
    return null;
  }
  return parsed;
}
