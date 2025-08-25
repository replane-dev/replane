export function createPromiseStatePending<T>(): PromiseState<T> {
  return {type: 'pending'};
}

export type PromiseState<T> =
  | {readonly type: 'fulfilled'; readonly value: T}
  | {readonly type: 'pending'}
  | {readonly type: 'rejected'; readonly reason: Error};

export class Deferred<T> {
  private _state: PromiseState<T> = {type: 'pending'};

  private _resolve!: (value: T) => void;
  private _reject!: (error: Error) => void;

  public readonly promise: Promise<T>;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  get state() {
    return this._state.type;
  }

  resolve(value: T) {
    if (this._state.type === 'pending') {
      this._state = {type: 'fulfilled', value: value};
      this._resolve(value);
    }
  }

  reject(error: Error) {
    if (this._state.type === 'pending') {
      this._state = {type: 'rejected', reason: error};
      this._reject(error);
    }
  }
}
