export interface DateProvider {
  now: () => Date;
}

export class DefaultDateProvider implements DateProvider {
  now(): Date {
    return new Date();
  }
}

export class MockDateProvider implements DateProvider {
  constructor(private _now: () => Date) {}

  now(): Date {
    return this._now();
  }
}
