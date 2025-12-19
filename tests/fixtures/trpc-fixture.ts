import {type Context, GLOBAL_CONTEXT} from '@/engine/core/context';
import {MockDateProvider} from '@/engine/core/date-provider';
import type {LogLevel} from '@/engine/core/logger';
import {normalizeEmail} from '@/engine/core/utils';
import {asConfigSchema, asConfigValue} from '@/engine/core/zod';
import {createEdge, type Edge} from '@/engine/edge';
import {createEngine, type Engine} from '@/engine/engine';
import {getDatabaseUrl} from '@/environment';
import {createCallerFactory, type TrpcContext} from '@/trpc/init';
import {appRouter} from '@/trpc/routers/_app';
import {afterEach, beforeEach} from 'vitest';

export interface TrpcFixtureOptions {
  authEmail: string;
  logLevel?: LogLevel;
  onConflictRetriesCount?: number;
  onFatalError?: (error: unknown) => void;
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
  private _edge: Edge | undefined;
  private overrideNow: Date = new Date();
  private _workspaceId: string | undefined;
  private _projectId: string | undefined;
  private _productionEnvironmentId: string | undefined;
  private _developmentEnvironmentId: string | undefined;

  constructor(private options: TrpcFixtureOptions) {}

  async init() {
    this.overrideNow = new Date('2020-01-01T00:00:00Z');

    const dbSchema = `test_${Math.random().toString(36).substring(2, 15)}`;

    const engine = await createEngine({
      databaseUrl: getDatabaseUrl(),
      dbSchema,
      logLevel: this.options.logLevel ?? 'warn',
      dateProvider: new MockDateProvider(() => new Date(this.overrideNow)),
      onConflictRetriesCount: this.options.onConflictRetriesCount,
      baseUrl: 'http://localhost:3000',
    });

    const edge = await createEdge({
      databaseUrl: getDatabaseUrl(),
      dbSchema,
      logLevel: this.options.logLevel ?? 'warn',
      dateProvider: new MockDateProvider(() => new Date(this.overrideNow)),
      onFatalError: error => {
        this.options.onFatalError?.(error);
      },
      replicaStorage: {
        type: 'memory',
      },
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
    this._edge = edge;

    // Create test workspace
    const {workspaceId} = await engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
      currentUserEmail: normalizeEmail(this.options.authEmail),
      name: 'Test Workspace',
    });
    this._workspaceId = workspaceId;

    const {projectId, environments} = await engine.useCases.createProject(GLOBAL_CONTEXT, {
      currentUserEmail: normalizeEmail(this.options.authEmail),
      workspaceId,
      name: 'Test Project',
      description: 'Default project for tests',
    });
    this._projectId = projectId;

    this._productionEnvironmentId = environments.find(e => e.name === 'Production')?.id;
    this._developmentEnvironmentId = environments.find(e => e.name === 'Development')?.id;
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

  get edge(): Edge {
    if (!this._edge) {
      throw new Error('edge is not initialized');
    }
    return this._edge;
  }

  get workspaceId(): string {
    if (!this._workspaceId) throw new Error('workspaceId not initialized');
    return this._workspaceId;
  }

  get projectId(): string {
    if (!this._projectId) throw new Error('projectId not initialized');
    return this._projectId;
  }

  get productionEnvironmentId(): string {
    if (!this._productionEnvironmentId) throw new Error('productionEnvironmentId not initialized');
    return this._productionEnvironmentId;
  }

  get developmentEnvironmentId(): string {
    if (!this._developmentEnvironmentId)
      throw new Error('developmentEnvironmentId not initialized');
    return this._developmentEnvironmentId;
  }

  get environments() {
    return [
      {id: this.productionEnvironmentId, name: 'Production'},
      {id: this.developmentEnvironmentId, name: 'Development'},
    ];
  }

  async syncReplica() {
    await this.edge.testing.replicaService.sync();
  }

  /**
   * Helper to create a config using old API format (for backward compatibility in tests)
   * Automatically creates environment-specific variants for all environments
   */
  async createConfig(params: {
    name: string;
    value: unknown;
    schema: unknown | null;
    overrides: any[];
    description: string;
    currentUserEmail: string;
    editorEmails: string[];
    maintainerEmails: string[];
    projectId: string;
  }) {
    // Fetch environments for the specific project
    const {environments} = await this.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      projectId: params.projectId,
      currentUserEmail: normalizeEmail(params.currentUserEmail),
    });

    return this.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: params.name,
      description: params.description,
      currentUserEmail: normalizeEmail(params.currentUserEmail),
      editorEmails: params.editorEmails,
      maintainerEmails: params.maintainerEmails,
      projectId: params.projectId,
      defaultVariant: {
        value: asConfigValue(params.value),
        schema: params.schema !== null ? asConfigSchema(params.schema) : null,
        overrides: params.overrides,
      },
      environmentVariants: environments.map(env => ({
        environmentId: env.id,
        value: asConfigValue(params.value),
        schema: params.schema !== null ? asConfigSchema(params.schema) : null,
        overrides: params.overrides,
        useDefaultSchema: false,
      })),
    });
  }

  async destroy(ctx: Context) {
    if (this._edge) {
      await this._edge.stop();
    }

    if (this._engine) {
      await this._engine.testing.dropDb(ctx);
      // engine.stop() closes pg connection, so we cant drop db after it
      await this._engine.stop();
    }

    this._trpc = undefined;
    this._engine = undefined;
    this._edge = undefined;
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
