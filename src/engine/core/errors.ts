export class BadRequestError extends Error {
  code?: string;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      code?: string;
    },
  ) {
    super(message, {cause: options?.cause});
    this.name = 'BadRequestError';
    this.code = options?.code;
  }
}

export class ConflictError extends Error {
  constructor(message: string, options: {cause?: unknown} = {}) {
    super(message, options);
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class TooManyRequestsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TooManyRequestsError';
  }
}

export function getErrorFingerprint(error: unknown): string {
  if (error instanceof Error) {
    const messageLine = error.message;
    const stackLines = (error.stack ?? '').split('\n').join('|');
    return `${error.name}:${messageLine}:${stackLines}`;
  }
  return String(error).slice(0, 100);
}
