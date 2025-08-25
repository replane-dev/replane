export class BadRequestError extends Error {
  constructor(message: string, options: {cause?: unknown} = {}) {
    super(message, options);
    this.name = 'BadRequestError';
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
