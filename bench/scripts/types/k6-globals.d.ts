/**
 * k6 global types
 */

declare const __VU: number;
declare const __ITER: number;
declare const __ENV: { [key: string]: string | undefined };

interface Console {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

declare const console: Console;
