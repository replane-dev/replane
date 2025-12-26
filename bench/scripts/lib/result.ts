/**
 * Result type for typed API responses
 */

export interface Success<T> {
  ok: true;
  status: number;
  data: T;
}

export interface Failure {
  ok: false;
  status: number;
  error: string;
}

export type Result<T> = Success<T> | Failure;

/**
 * Create a success result
 */
export function success<T>(status: number, data: T): Success<T> {
  return { ok: true, status, data };
}

/**
 * Create a failure result
 */
export function failure(status: number, error: string): Failure {
  return { ok: false, status, error };
}
