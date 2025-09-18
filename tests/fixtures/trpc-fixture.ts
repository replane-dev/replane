import {type Context, GLOBAL_CONTEXT} from '@/engine/core/context';
import {MockDateProvider} from '@/engine/core/date-provider';
import type {LogLevel} from '@/engine/core/logger';
import {normalizeEmail} from '@/engine/core/utils';
import {createEngine, type Engine} from '@/engine/engine';
import {getDatabaseUrl} from '@/engine/engine-singleton';
import {createCallerFactory, type TrpcContext} from '@/trpc/init';
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

export const TEST_USER_ID = 1;

export class AppFixture {
  private _trpc: TrpcCaller | undefined;
  private _engine: Engine | undefined;
  private overrideNow: Date = new Date();
  private _projectId: string | undefined;

  constructor(private options: TrpcFixtureOptions) {}

  async init() {
    this.overrideNow = new Date('2020-01-01T00:00:00Z');

    const engine = await createEngine({
      databaseUrl: getDatabaseUrl(),
      dbSchema: `test_${Math.random().toString(36).substring(2, 15)}`,
      logLevel: this.options.logLevel ?? 'warn',
      dateProvider: new MockDateProvider(() => new Date(this.overrideNow)),
      onConflictRetriesCount: this.options.onConflictRetriesCount,
    });

    const connection = await engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES ($1, 'Test User', $2, NOW())`,
        [TEST_USER_ID, this.options.authEmail],
      );
    } finally {
      connection.release();
    }

    const createCaller = createCallerFactory(appRouter);

    this._trpc = createCaller({engine, currentUserEmail: normalizeEmail(this.options.authEmail)});
    this._engine = engine;

    const {projectId} = await engine.useCases.createProject(GLOBAL_CONTEXT, {
      currentUserEmail: normalizeEmail(this.options.authEmail),
      name: 'Test Project',
      description: 'Default project for tests',
    });
    this._projectId = projectId;
  }

  get now() {
    return this.overrideNow;
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

  get projectId(): string {
    if (!this._projectId) throw new Error('projectId not initialized');
    return this._projectId;
  }

  async destroy(ctx: Context) {
    if (this._engine) {
      await this._engine.testing.dropDb(ctx);
      this._engine.destroy();
    }

    this._trpc = undefined;
    this._engine = undefined;
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
