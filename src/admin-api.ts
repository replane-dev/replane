import {type Context} from '@/engine/core/context';
import {BadRequestError, ForbiddenError, NotFoundError} from '@/engine/core/errors';
import {createUuidV4} from '@/engine/core/uuid';
import type {Engine} from '@/engine/engine';
import {OpenAPIHono} from '@hono/zod-openapi';
import * as Sentry from '@sentry/nextjs';
import {cors} from 'hono/cors';
import {HTTPException} from 'hono/http-exception';
import {z} from 'zod';
import {type ApiKeyIdentity, type SuperuserIdentity} from './engine/core/identity';
import {OverrideSchema} from './engine/core/override-condition-schemas';
import {ConfigSchema, ConfigValue} from './engine/core/zod';

interface HonoEnv {
  Variables: {
    context: Context;
    identity: ApiKeyIdentity | SuperuserIdentity;
  };
}

// ===== Schema definitions =====

const ProjectDto = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Project');

const ProjectListResponse = z
  .object({
    projects: z.array(ProjectDto),
  })
  .openapi('ProjectListResponse');

const WorkspaceDto = z
  .object({
    id: z.uuid(),
    name: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Workspace');

const WorkspaceListResponse = z
  .object({
    workspaces: z.array(WorkspaceDto),
  })
  .openapi('WorkspaceListResponse');

const ConfigVariantDto = z
  .object({
    value: ConfigValue(),
    schema: ConfigSchema().nullable(),
    overrides: z.array(OverrideSchema),
    useBaseSchema: z.boolean(),
  })
  .openapi('ConfigVariant');

const ConfigDto = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().optional(),
    version: z.number(),
    base: z.object({
      value: ConfigValue(),
      schema: ConfigSchema().nullable(),
      overrides: z.array(OverrideSchema),
    }),
    variants: z.array(ConfigVariantDto),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    editors: z.array(z.email()),
  })
  .openapi('Config');

type ConfigDto = z.infer<typeof ConfigDto>;

const ConfigListItemDto = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().optional(),
    version: z.number(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('ConfigListItem');

const ConfigListResponse = z
  .object({
    configs: z.array(ConfigListItemDto),
  })
  .openapi('ConfigListResponse');

const EnvironmentDto = z
  .object({
    id: z.uuid(),
    name: z.string(),
    order: z.number(),
  })
  .openapi('Environment');

const EnvironmentListResponse = z
  .object({
    environments: z.array(EnvironmentDto),
  })
  .openapi('EnvironmentListResponse');

const SdkKeyDto = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    environmentId: z.uuid(),
    createdAt: z.iso.datetime(),
  })
  .openapi('SdkKey');

const SdkKeyListResponse = z
  .object({
    sdkKeys: z.array(SdkKeyDto),
  })
  .openapi('SdkKeyListResponse');

const MemberDto = z
  .object({
    email: z.string().email(),
    role: z.string(),
  })
  .openapi('Member');

const MemberListResponse = z
  .object({
    members: z.array(MemberDto),
  })
  .openapi('MemberListResponse');

/**
 * Creates the Admin API Hono app with the provided engine.
 */
export function createAdminApi(engine: Engine): OpenAPIHono<HonoEnv> {
  const adminApi = new OpenAPIHono<HonoEnv>();

  // Global error handler
  adminApi.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }

    if (err instanceof BadRequestError) {
      return c.json({error: err.message}, 400);
    }

    if (err instanceof NotFoundError) {
      return c.json({error: err.message}, 404);
    }

    if (err instanceof ForbiddenError) {
      return c.json({error: 'Forbidden'}, 403);
    }

    Sentry.captureException(err, {
      extra: {
        method: c.req.method,
        url: c.req.url,
        path: c.req.path,
      },
    });

    console.error('Admin API error:', err);
    return c.json({error: 'Internal server error'}, 500);
  });

  adminApi.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  // Authentication middleware
  adminApi.use('*', async (c, next) => {
    const ctx: Context = {traceId: createUuidV4()};
    c.set('context', ctx);

    const path = new URL(c.req.url).pathname;
    if (path.endsWith('/openapi.json')) {
      return next();
    }

    const authHeader = c.req.header('authorization');
    const bearer = authHeader?.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

    if (!bearer) {
      return c.json({error: 'Missing API key'}, 401);
    }

    try {
      const result = await engine.useCases.verifyAdminApiKey(ctx, {key: bearer});

      if (result.status !== 'valid') {
        const errorMessages = {
          invalid_format: 'Invalid API key format',
          invalid_key: 'Invalid API key',
          expired: 'API key has expired',
        };
        return c.json({error: errorMessages[result.reason]}, 401);
      }

      c.set('identity', result.identity);
      await next();
    } catch (e) {
      Sentry.captureException(e, {
        extra: {
          method: c.req.method,
          url: c.req.url,
          path: c.req.path,
        },
      });
      console.error('Admin API auth error:', e);
      return c.json({error: 'Authentication failed'}, 500);
    }
  });

  // ===== Project endpoints =====

  adminApi.openapi(
    {
      method: 'get',
      path: '/projects',
      operationId: 'listProjects',
      responses: {
        200: {
          description: 'List of projects',
          content: {
            'application/json': {
              schema: ProjectListResponse,
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const ctx = c.get('context');

      const {projects} = await engine.useCases.getProjectList(ctx, {identity});

      return c.json({
        projects: projects.map(p => ({
          id: p.id,
          name: p.name,
          description: p.descriptionPreview,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
      });
    },
  );

  adminApi.openapi(
    {
      method: 'get',
      path: '/projects/{projectId}',
      operationId: 'getProject',
      request: {
        params: z.object({
          projectId: z.uuid(),
        }),
      },
      responses: {
        200: {
          description: 'Project details',
          content: {
            'application/json': {
              schema: ProjectDto,
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId} = c.req.valid('param');

      const ctx = c.get('context');

      const {project} = await engine.useCases.getProject(ctx, {
        identity,
        id: projectId,
      });

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      return c.json({
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      });
    },
  );

  // Create project
  adminApi.openapi(
    {
      method: 'post',
      path: '/projects',
      operationId: 'createProject',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                name: z.string().min(1).max(100),
                description: z.string().max(10000),
                workspaceId: z.uuid(),
              }),
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Project created',
          content: {
            'application/json': {
              schema: z.object({
                id: z.uuid(),
              }),
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const body = c.req.valid('json');
      const ctx = c.get('context');

      const {projectId} = await engine.useCases.createProject(ctx, {
        identity,
        workspaceId: body.workspaceId,
        name: body.name,
        description: body.description,
      });

      return c.json({id: projectId}, 201);
    },
  );

  // Update project
  adminApi.openapi(
    {
      method: 'patch',
      path: '/projects/{projectId}',
      operationId: 'updateProject',
      request: {
        params: z.object({
          projectId: z.uuid(),
        }),
        body: {
          content: {
            'application/json': {
              schema: z.object({
                name: z.string().min(1).max(100).optional(),
                description: z.string().max(10000).optional(),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Project updated',
          content: {
            'application/json': {
              schema: z.object({
                id: z.uuid(),
              }),
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId} = c.req.valid('param');
      const body = c.req.valid('json');
      const ctx = c.get('context');

      await engine.useCases.patchProject(ctx, {
        identity,
        id: projectId,
        details: {
          name: body.name,
          description: body.description,
        },
      });

      return c.json({id: projectId});
    },
  );

  // Delete project
  adminApi.openapi(
    {
      method: 'delete',
      path: '/projects/{projectId}',
      operationId: 'deleteProject',
      request: {
        params: z.object({
          projectId: z.uuid(),
        }),
      },
      responses: {
        204: {
          description: 'Project deleted',
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId} = c.req.valid('param');

      const ctx = c.get('context');

      await engine.useCases.deleteProject(ctx, {
        identity,
        id: projectId,
        confirmName: null,
      });

      return c.body(null, 204);
    },
  );

  // ===== Workspace endpoints =====

  adminApi.openapi(
    {
      method: 'get',
      path: '/workspaces',
      operationId: 'listWorkspaces',
      responses: {
        200: {
          description: 'List of workspaces accessible to the identity',
          content: {
            'application/json': {
              schema: WorkspaceListResponse,
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const ctx = c.get('context');

      const workspaces = await engine.useCases.getWorkspaceList(ctx, {identity});

      return c.json({
        workspaces: workspaces.map(w => ({
          id: w.id,
          name: w.name,
          createdAt: w.createdAt.toISOString(),
          updatedAt: w.updatedAt.toISOString(),
        })),
      });
    },
  );

  adminApi.openapi(
    {
      method: 'get',
      path: '/workspaces/{workspaceId}',
      operationId: 'getWorkspace',
      request: {
        params: z.object({
          workspaceId: z.uuid(),
        }),
      },
      responses: {
        200: {
          description: 'Workspace details',
          content: {
            'application/json': {
              schema: WorkspaceDto,
            },
          },
        },
        404: {
          description: 'Workspace not found',
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {workspaceId} = c.req.valid('param');
      const ctx = c.get('context');

      const workspace = await engine.useCases.getWorkspace(ctx, {
        identity,
        workspaceId,
      });

      return c.json({
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.createdAt.toISOString(),
        updatedAt: workspace.updatedAt.toISOString(),
      });
    },
  );

  adminApi.openapi(
    {
      method: 'post',
      path: '/workspaces',
      operationId: 'createWorkspace',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                name: z.string().min(1).max(100),
              }),
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Workspace created',
          content: {
            'application/json': {
              schema: z.object({
                id: z.uuid(),
              }),
            },
          },
        },
        403: {
          description: 'Forbidden - requires superuser access',
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const body = c.req.valid('json');
      const ctx = c.get('context');

      const {workspaceId} = await engine.useCases.createWorkspace(ctx, {
        identity,
        name: body.name,
      });

      return c.json({id: workspaceId}, 201);
    },
  );

  adminApi.openapi(
    {
      method: 'delete',
      path: '/workspaces/{workspaceId}',
      operationId: 'deleteWorkspace',
      request: {
        params: z.object({
          workspaceId: z.uuid(),
        }),
      },
      responses: {
        204: {
          description: 'Workspace deleted',
        },
        403: {
          description: 'Forbidden - requires superuser access',
        },
        404: {
          description: 'Workspace not found',
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {workspaceId} = c.req.valid('param');
      const ctx = c.get('context');

      await engine.useCases.deleteWorkspace(ctx, {
        identity,
        workspaceId,
      });

      return c.body(null, 204);
    },
  );

  // ===== Config endpoints =====

  adminApi.openapi(
    {
      method: 'get',
      path: '/projects/{projectId}/configs',
      operationId: 'listConfigs',
      request: {
        params: z.object({
          projectId: z.uuid(),
        }),
      },
      responses: {
        200: {
          description: 'List of configs',
          content: {
            'application/json': {
              schema: ConfigListResponse,
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId} = c.req.valid('param');

      const ctx = c.get('context');

      const {configs} = await engine.useCases.getConfigList(ctx, {
        identity,
        projectId,
      });

      return c.json({
        configs: configs.map(config => ({
          id: config.id,
          name: config.name,
          description: config.descriptionPreview,
          version: config.version,
          createdAt: config.createdAt.toISOString(),
          updatedAt: config.updatedAt.toISOString(),
        })),
      });
    },
  );

  adminApi.openapi(
    {
      method: 'get',
      path: '/projects/{projectId}/configs/{configName}',
      operationId: 'getConfig',
      request: {
        params: z.object({
          projectId: z.uuid(),
          configName: z.string(),
        }),
      },
      responses: {
        200: {
          description: 'Config details',
          content: {
            'application/json': {
              schema: ConfigDto,
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId, configName} = c.req.valid('param');

      const ctx = c.get('context');

      const {config: configDetails} = await engine.useCases.getConfig(ctx, {
        identity,
        projectId,
        name: configName,
      });

      if (!configDetails) {
        throw new NotFoundError('Config not found');
      }

      const cfg = configDetails.config;

      return c.json({
        id: cfg.id,
        name: cfg.name,
        description: cfg.description,
        version: cfg.version,
        createdAt: cfg.createdAt.toISOString(),
        updatedAt: cfg.updatedAt.toISOString(),
        editors: configDetails.editorEmails,
        base: {
          value: cfg.value,
          schema: cfg.schema,
          overrides: cfg.overrides,
        },
        variants: configDetails.variants.map(e => ({
          environmentId: e.environmentId,
          value: e.value,
          schema: e.schema,
          overrides: e.overrides,
          useBaseSchema: e.useBaseSchema,
        })),
      } satisfies ConfigDto);
    },
  );

  // Create config
  adminApi.openapi(
    {
      method: 'post',
      path: '/projects/{projectId}/configs',
      operationId: 'createConfig',
      request: {
        params: z.object({
          projectId: z.uuid(),
        }),
        body: {
          content: {
            'application/json': {
              schema: z.object({
                name: z.string().min(1).max(100),
                description: z.string().max(10000),
                editors: z.array(z.email()),
                maintainers: z.array(z.email()),
                base: z.object({
                  value: ConfigValue(),
                  schema: ConfigSchema().nullable(),
                  overrides: z.array(OverrideSchema),
                }),
                variants: z.array(
                  z.object({
                    environmentId: z.uuid(),
                    value: ConfigValue(),
                    schema: ConfigSchema().nullable(),
                    overrides: z.array(OverrideSchema),
                    useBaseSchema: z.boolean(),
                  }),
                ),
              }),
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Config created',
          content: {
            'application/json': {
              schema: z.object({
                id: z.uuid(),
              }),
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId} = c.req.valid('param');
      const body = c.req.valid('json');
      const ctx = c.get('context');

      const {configId} = await engine.useCases.createConfig(ctx, {
        identity,
        projectId,
        name: body.name,
        description: body.description,
        editorEmails: body.editors,
        maintainerEmails: body.maintainers,
        defaultVariant: {
          value: body.base.value,
          schema: body.base.schema,
          overrides: body.base.overrides,
        },
        environmentVariants: body.variants.map(e => ({
          environmentId: e.environmentId,
          value: e.value,
          schema: e.schema,
          overrides: e.overrides,
          useBaseSchema: e.useBaseSchema,
        })),
      });

      return c.json({id: configId}, 201);
    },
  );

  // Update config
  adminApi.openapi(
    {
      method: 'put',
      path: '/projects/{projectId}/configs/{configName}',
      operationId: 'updateConfig',
      request: {
        params: z.object({
          projectId: z.uuid(),
          configName: z.string(),
        }),
        body: {
          content: {
            'application/json': {
              schema: z.object({
                description: z.string().max(10000),
                editors: z.array(z.email()),
                base: z.object({
                  value: ConfigValue(),
                  schema: ConfigSchema().nullable(),
                  overrides: z.array(OverrideSchema),
                }),
                variants: z.array(
                  z.object({
                    environmentId: z.uuid(),
                    value: ConfigValue(),
                    schema: ConfigSchema().nullable(),
                    overrides: z.array(OverrideSchema),
                    useBaseSchema: z.boolean(),
                  }),
                ),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Config updated',
          content: {
            'application/json': {
              schema: z.object({
                id: z.uuid(),
                version: z.number(),
              }),
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId, configName} = c.req.valid('param');
      const body = c.req.valid('json');
      const ctx = c.get('context');

      const {configId, version} = await engine.useCases.updateConfig(ctx, {
        identity,
        projectId,
        configName,
        description: body.description,
        editors: body.editors,
        // we don't support maintainers in the admin API
        maintainers: null,
        base: {
          value: body.base.value,
          schema: body.base.schema,
          overrides: body.base.overrides,
        },
        environments: body.variants.map(v => ({
          environmentId: v.environmentId,
          value: v.value,
          schema: v.schema,
          overrides: v.overrides,
          useBaseSchema: v.useBaseSchema,
        })),
        prevVersion: undefined,
      });

      return c.json({id: configId, version});
    },
  );

  // Delete config
  adminApi.openapi(
    {
      method: 'delete',
      path: '/projects/{projectId}/configs/{configName}',
      operationId: 'deleteConfig',
      request: {
        params: z.object({
          projectId: z.uuid(),
          configName: z.string(),
        }),
      },
      responses: {
        204: {
          description: 'Config deleted',
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId, configName} = c.req.valid('param');
      const ctx = c.get('context');

      await engine.useCases.deleteConfig(ctx, {
        identity,
        projectId,
        configName,
        prevVersion: undefined,
      });

      return c.body(null, 204);
    },
  );

  // ===== Environment endpoints =====

  adminApi.openapi(
    {
      method: 'get',
      path: '/projects/{projectId}/environments',
      operationId: 'listEnvironments',
      request: {
        params: z.object({
          projectId: z.uuid(),
        }),
      },
      responses: {
        200: {
          description: 'List of environments',
          content: {
            'application/json': {
              schema: EnvironmentListResponse,
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId} = c.req.valid('param');

      const ctx = c.get('context');

      const {environments} = await engine.useCases.getProjectEnvironments(ctx, {
        identity,
        projectId,
      });

      return c.json({
        environments: environments.map(env => ({
          id: env.id,
          name: env.name,
          order: env.order,
        })),
      });
    },
  );

  // ===== SDK Key endpoints =====

  adminApi.openapi(
    {
      method: 'get',
      path: '/projects/{projectId}/sdk-keys',
      operationId: 'listSdkKeys',
      request: {
        params: z.object({
          projectId: z.uuid(),
        }),
      },
      responses: {
        200: {
          description: 'List of SDK keys',
          content: {
            'application/json': {
              schema: SdkKeyListResponse,
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId} = c.req.valid('param');

      const ctx = c.get('context');

      const {sdkKeys} = await engine.useCases.getSdkKeyList(ctx, {
        identity,
        projectId,
      });

      return c.json({
        sdkKeys: sdkKeys.map(key => ({
          id: key.id,
          name: key.name,
          description: key.description,
          environmentId: key.environmentId,
          createdAt: key.createdAt.toISOString(),
        })),
      });
    },
  );

  // Create SDK key
  adminApi.openapi(
    {
      method: 'post',
      path: '/projects/{projectId}/sdk-keys',
      operationId: 'createSdkKey',
      request: {
        params: z.object({
          projectId: z.uuid(),
        }),
        body: {
          content: {
            'application/json': {
              schema: z.object({
                name: z.string().min(1).max(100),
                description: z.string().max(1000).optional(),
                environmentId: z.uuid(),
              }),
            },
          },
        },
      },
      responses: {
        201: {
          description: 'SDK key created',
          content: {
            'application/json': {
              schema: z.object({
                id: z.uuid(),
                name: z.string(),
                description: z.string(),
                environmentId: z.uuid(),
                createdAt: z.iso.datetime(),
                key: z.string(),
              }),
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId} = c.req.valid('param');
      const body = c.req.valid('json');

      const ctx = c.get('context');

      const {sdkKey} = await engine.useCases.createSdkKey(ctx, {
        identity,
        projectId,
        name: body.name,
        description: body.description ?? '',
        environmentId: body.environmentId,
      });

      return c.json(
        {
          id: sdkKey.id,
          name: sdkKey.name,
          description: sdkKey.description,
          environmentId: body.environmentId,
          createdAt: sdkKey.createdAt.toISOString(),
          key: sdkKey.token,
        },
        201,
      );
    },
  );

  // Delete SDK key
  adminApi.openapi(
    {
      method: 'delete',
      path: '/projects/{projectId}/sdk-keys/{sdkKeyId}',
      operationId: 'deleteSdkKey',
      request: {
        params: z.object({
          projectId: z.uuid(),
          sdkKeyId: z.uuid(),
        }),
      },
      responses: {
        204: {
          description: 'SDK key deleted',
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId, sdkKeyId} = c.req.valid('param');

      const ctx = c.get('context');

      await engine.useCases.deleteSdkKey(ctx, {
        identity,
        projectId,
        id: sdkKeyId,
      });

      return c.body(null, 204);
    },
  );

  // ===== Member endpoints =====

  adminApi.openapi(
    {
      method: 'get',
      path: '/projects/{projectId}/members',
      operationId: 'listProjectMembers',
      request: {
        params: z.object({
          projectId: z.uuid(),
        }),
      },
      responses: {
        200: {
          description: 'List of project members',
          content: {
            'application/json': {
              schema: MemberListResponse,
            },
          },
        },
      },
    },
    async c => {
      const identity = c.get('identity');
      const {projectId} = c.req.valid('param');

      const ctx = c.get('context');

      const {users} = await engine.useCases.getProjectUsers(ctx, {
        identity,
        projectId,
      });

      return c.json({
        members: users.map(user => ({
          email: user.email,
          role: user.role,
        })),
      });
    },
  );

  // OpenAPI spec endpoint
  adminApi.get('/openapi.json', c =>
    c.json(
      adminApi.getOpenAPI31Document({
        openapi: '3.1.0',
        info: {title: 'Replane Admin API', version: '1.0.0'},
        servers: [{url: '/api/admin/v1'}],
      }),
    ),
  );

  return adminApi;
}
