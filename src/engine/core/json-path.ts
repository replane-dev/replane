import {z} from 'zod';

// JSON path part can be a string key or a number index
export const PathPartSchema = z.union([z.string(), z.number()]);
export type PathPart = z.infer<typeof PathPartSchema>;

// JSON path is an array of path parts
export const JsonPathSchema = z.array(PathPartSchema);
export type JsonPath = z.infer<typeof JsonPathSchema>;

/**
 * Get a value from an object using a JSON path
 */
export function getValueByPath(obj: unknown, path: JsonPath): unknown {
  let current = obj;

  for (const part of path) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === 'object') {
      current = (current as any)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Format a JSON path as a string for display
 */
export function formatJsonPath(path: JsonPath): string {
  if (path.length === 0) return '';

  return path
    .map((part, index) => {
      if (typeof part === 'number') {
        return `[${part}]`;
      }
      if (index === 0) {
        return part;
      }
      // Check if the key needs quotes (contains special characters)
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(part)) {
        return `.${part}`;
      }
      return `["${part}"]`;
    })
    .join('');
}

/**
 * Parse a JSON path string into a JsonPath
 * Examples:
 * - "foo.bar" -> ["foo", "bar"]
 * - "foo[0]" -> ["foo", 0]
 * - "foo.bar[1].baz" -> ["foo", "bar", 1, "baz"]
 */
export function parseJsonPath(pathString: string): JsonPath {
  if (!pathString) return [];

  const parts: JsonPath = [];
  let current = '';
  let inBracket = false;

  for (let i = 0; i < pathString.length; i++) {
    const char = pathString[i];

    if (char === '[') {
      if (current) {
        parts.push(current);
        current = '';
      }
      inBracket = true;
    } else if (char === ']') {
      if (inBracket && current) {
        const num = parseInt(current, 10);
        parts.push(isNaN(num) ? current : num);
        current = '';
      }
      inBracket = false;
    } else if (char === '.' && !inBracket) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}
