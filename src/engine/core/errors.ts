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
