import {Context, GLOBAL_CONTEXT} from '@/engine/core/context';
import {MockDateProvider} from '@/engine/core/date-provider';
import {LogLevel} from '@/engine/core/logger';
import {ensureDefined} from '@/engine/core/utils';
import {createEngine, Engine} from '@/engine/engine';
import {createCallerFactory, TrpcContext} from '@/trpc/init';
import {appRouter} from '@/trpc/routers/_app';
import {afterEach, beforeEach} from 'vitest';

export interface TrpcFixtureOptions {
  authEmail: string;
  logLevel?: LogLevel;
  onConflictRetriesCount?: number;
}

function _createCaller() {
  if (true as boolean) {
    throw new Error('this function exists only for type inference');
  }

  return createCallerFactory(appRouter)(undefined as unknown as TrpcContext);
}

type TrpcCaller = ReturnType<typeof _createCaller>;

export class AppFixture {
  private _trpc: TrpcCaller | undefined;
  private _engine: Engine | undefined;
  private overrideNow: Date | undefined = undefined;

  constructor(private options: TrpcFixtureOptions) {}

  async init() {
    const engine = await createEngine({
      databaseUrl: ensureDefined(process.env.DATABASE_URL, 'DATABASE_URL environment variable is required'),
      dbSchema: `test_${Math.random().toString(36).substring(2, 15)}`,
      logLevel: this.options.logLevel ?? 'warn',
      dateProvider: new MockDateProvider(() => new Date(this.overrideNow ?? new Date())),
      onConflictRetriesCount: this.options.onConflictRetriesCount,
    });

    const createCaller = createCallerFactory(appRouter);

    this._trpc = createCaller({engine, accountEmail: this.options.authEmail});
    this._engine = engine;
  }

  setNow(date: Date) {
    this.overrideNow = date;
  }

  get trpc(): TrpcCaller {
    if (!this._trpc) {
      throw new Error('caller is not initialized');
    }
    return this._trpc;
  }

  get engine(): Engine {
    if (!this._engine) {
      throw new Error('engine is not initialized');
    }
    return this._engine;
  }

  async destroy(ctx: Context) {
    if (this._engine) {
      await this._engine.testing.dropDb(ctx);
      this._engine.destroy();
    }

    this._trpc = undefined;
    this._engine = undefined;
    this.overrideNow = undefined;
  }
}

export function useAppFixture(options: TrpcFixtureOptions) {
  const fixture = new AppFixture(options);

  beforeEach(async () => {
    await fixture.init();
  });

  afterEach(async () => {
    await fixture.destroy(GLOBAL_CONTEXT);
  });

  return fixture;
}
