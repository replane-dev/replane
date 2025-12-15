import {getAuthOptions} from '@/app/auth-options';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {ConfigDescription, ConfigName, ConfigOverrides} from '@/engine/core/stores/config-store';
import {ProjectDescription, ProjectName} from '@/engine/core/stores/project-store';
import {WorkspaceName} from '@/engine/core/stores/workspace-store';
import {
  ConfigSchema,
  ConfigValue,
  EditorArray,
  Email,
  MaintainerArray,
  Uuid,
} from '@/engine/core/zod';
import {TRPCError} from '@trpc/server';
import {z} from 'zod';
import {baseProcedure, createTRPCRouter} from '../init';

export const appRouter = createTRPCRouter({
  getWorkspace: baseProcedure.input(z.object({workspaceId: Uuid()})).query(async opts => {
    if (!opts.ctx.currentUserEmail) {
      throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
    }
    return await opts.ctx.engine.useCases.getWorkspace(GLOBAL_CONTEXT, {
      workspaceId: opts.input.workspaceId,
      currentUserEmail: opts.ctx.currentUserEmail,
    });
  }),
  getWorkspaceList: baseProcedure.query(async opts => {
    if (!opts.ctx.currentUserEmail) {
      throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
    }
    return await opts.ctx.engine.useCases.getWorkspaceList(GLOBAL_CONTEXT, {
      currentUserEmail: opts.ctx.currentUserEmail,
    });
  }),
  createWorkspace: baseProcedure
    .input(
      z.object({
        name: WorkspaceName(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        currentUserEmail: opts.ctx.currentUserEmail,
        name: opts.input.name,
      });
    }),
  updateWorkspace: baseProcedure
    .input(
      z.object({
        workspaceId: Uuid(),
        name: WorkspaceName(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.updateWorkspace(GLOBAL_CONTEXT, {
        workspaceId: opts.input.workspaceId,
        currentUserEmail: opts.ctx.currentUserEmail,
        name: opts.input.name,
      });
    }),
  deleteWorkspace: baseProcedure.input(z.object({workspaceId: Uuid()})).mutation(async opts => {
    if (!opts.ctx.currentUserEmail) {
      throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
    }
    return await opts.ctx.engine.useCases.deleteWorkspace(GLOBAL_CONTEXT, {
      workspaceId: opts.input.workspaceId,
      currentUserEmail: opts.ctx.currentUserEmail,
    });
  }),
  deleteUserAccount: baseProcedure
    .input(z.object({confirmEmail: z.string().email()}))
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.deleteUserAccount(GLOBAL_CONTEXT, {
        currentUserEmail: opts.ctx.currentUserEmail,
        confirmEmail: opts.input.confirmEmail,
      });
    }),
  getWorkspaceMembers: baseProcedure.input(z.object({workspaceId: Uuid()})).query(async opts => {
    if (!opts.ctx.currentUserEmail) {
      throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
    }
    return await opts.ctx.engine.useCases.getWorkspaceMembers(GLOBAL_CONTEXT, {
      workspaceId: opts.input.workspaceId,
      currentUserEmail: opts.ctx.currentUserEmail,
    });
  }),
  addWorkspaceMember: baseProcedure
    .input(
      z.object({
        workspaceId: Uuid(),
        memberEmail: Email(),
        role: z.enum(['admin', 'member']),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId: opts.input.workspaceId,
        currentUserEmail: opts.ctx.currentUserEmail,
        memberEmail: opts.input.memberEmail,
        role: opts.input.role,
      });
    }),
  removeWorkspaceMember: baseProcedure
    .input(
      z.object({
        workspaceId: Uuid(),
        memberEmail: Email(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.removeWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId: opts.input.workspaceId,
        currentUserEmail: opts.ctx.currentUserEmail,
        memberEmail: opts.input.memberEmail,
      });
    }),
  updateWorkspaceMemberRole: baseProcedure
    .input(
      z.object({
        workspaceId: Uuid(),
        memberEmail: Email(),
        role: z.enum(['admin', 'member']),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.updateWorkspaceMemberRole(GLOBAL_CONTEXT, {
        workspaceId: opts.input.workspaceId,
        currentUserEmail: opts.ctx.currentUserEmail,
        memberEmail: opts.input.memberEmail,
        role: opts.input.role,
      });
    }),
  getAuthProviders: baseProcedure.query(async () => {
    const authOptions = getAuthOptions();
    return {
      providers: authOptions.providers.map(p => ({
        id: p.id,
        name: p.name,
      })),
    };
  }),
  hello: baseProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .query(opts => {
      return {
        greeting: `hello ${opts.input.text}`,
      };
    }),
  getHealth: baseProcedure.query(async opts => {
    return await opts.ctx.engine.useCases.getHealth(GLOBAL_CONTEXT, {});
  }),
  getConfigList: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }

      const configList = await opts.ctx.engine.useCases.getConfigList(GLOBAL_CONTEXT, {
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return configList;
    }),
  createConfig: baseProcedure
    .input(
      z.object({
        name: ConfigName(),
        description: ConfigDescription(),
        editorEmails: EditorArray(),
        maintainerEmails: MaintainerArray(),
        projectId: Uuid(),
        defaultVariant: z.object({
          value: ConfigValue(),
          schema: ConfigSchema().nullable(),
          overrides: ConfigOverrides(),
        }),
        environmentVariants: z.array(
          z.object({
            environmentId: Uuid(),
            value: ConfigValue(),
            schema: ConfigSchema().nullable(),
            overrides: ConfigOverrides(),
            useDefaultSchema: z.boolean(),
          }),
        ),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        ...opts.input,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return {};
    }),
  updateConfig: baseProcedure
    .input(
      z.object({
        configId: Uuid(),
        description: ConfigDescription(),
        editorEmails: EditorArray(),
        maintainerEmails: MaintainerArray(),
        defaultVariant: z.object({
          value: ConfigValue(),
          schema: ConfigSchema().nullable(),
          overrides: ConfigOverrides(),
        }),
        environmentVariants: z.array(
          z.object({
            environmentId: Uuid(),
            value: ConfigValue(),
            schema: ConfigSchema().nullable(),
            overrides: ConfigOverrides(),
            useDefaultSchema: z.boolean(),
          }),
        ),
        prevVersion: z.number(),
        originalProposalId: Uuid().optional(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        ...opts.input,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return {};
    }),
  deleteConfig: baseProcedure
    .input(
      z.object({
        configId: Uuid(),
        prevVersion: z.number(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId: opts.input.configId,
        currentUserEmail: opts.ctx.currentUserEmail,
        prevVersion: opts.input.prevVersion,
      });
      return {};
    }),
  getConfig: baseProcedure
    .input(
      z.object({
        name: z.string(),
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }

      const config = await opts.ctx.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: opts.input.name,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return config;
    }),
  getConfigPageData: baseProcedure
    .input(
      z.object({
        configName: z.string(),
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }

      return await opts.ctx.engine.useCases.getConfigPageData(GLOBAL_CONTEXT, {
        configName: opts.input.configName,
        projectId: opts.input.projectId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  getNewConfigPageData: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }

      return await opts.ctx.engine.useCases.getNewConfigPageData(GLOBAL_CONTEXT, {
        projectId: opts.input.projectId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  getSdkKeyPageData: baseProcedure
    .input(
      z.object({
        id: Uuid(),
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }

      return await opts.ctx.engine.useCases.getSdkKeyPageData(GLOBAL_CONTEXT, {
        id: opts.input.id,
        projectId: opts.input.projectId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  getNewSdkKeyPageData: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }

      return await opts.ctx.engine.useCases.getNewSdkKeyPageData(GLOBAL_CONTEXT, {
        projectId: opts.input.projectId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  getProjectConfigTypes: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
        environmentId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }

      return await opts.ctx.engine.useCases.getProjectConfigTypes(GLOBAL_CONTEXT, {
        projectId: opts.input.projectId,
        environmentId: opts.input.environmentId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  getConfigVariantVersionList: baseProcedure
    .input(
      z.object({
        configId: Uuid(),
        environmentId: Uuid(),
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const result = await opts.ctx.engine.useCases.getConfigVariantVersionList(GLOBAL_CONTEXT, {
        configId: opts.input.configId,
        environmentId: opts.input.environmentId,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return result;
    }),
  getConfigVariantVersion: baseProcedure
    .input(
      z.object({
        configId: Uuid(),
        version: z.number(),
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const result = await opts.ctx.engine.useCases.getConfigVariantVersion(GLOBAL_CONTEXT, {
        configId: opts.input.configId,
        version: opts.input.version,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return result;
    }),
  getSdkKeyList: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
    }),
  getSdkKey: baseProcedure
    .input(
      z.object({
        id: Uuid(),
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.getSdkKey(GLOBAL_CONTEXT, {
        id: opts.input.id,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
    }),
  getProjectList: baseProcedure.query(async opts => {
    if (!opts.ctx.currentUserEmail) {
      throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
    }
    return await opts.ctx.engine.useCases.getProjectList(GLOBAL_CONTEXT, {
      currentUserEmail: opts.ctx.currentUserEmail,
    });
  }),
  getAppLayoutData: baseProcedure.query(async opts => {
    if (!opts.ctx.currentUserEmail) {
      throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
    }
    return await opts.ctx.engine.useCases.getAppLayoutData(GLOBAL_CONTEXT, {
      currentUserEmail: opts.ctx.currentUserEmail,
    });
  }),
  getProject: baseProcedure
    .input(
      z.object({
        id: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.getProject(GLOBAL_CONTEXT, {
        id: opts.input.id,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  patchProject: baseProcedure
    .input(
      z.object({
        id: Uuid(),
        details: z
          .object({
            name: ProjectName(),
            description: ProjectDescription(),
            requireProposals: z.boolean().optional(),
            allowSelfApprovals: z.boolean().optional(),
          })
          .optional(),
        members: z
          .object({
            users: z.array(
              z.object({
                email: Email(),
                role: z.enum(['maintainer', 'admin']),
              }),
            ),
          })
          .optional(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: opts.input.id,
        currentUserEmail: opts.ctx.currentUserEmail,
        details: opts.input.details,
        members: opts.input.members,
      });
    }),
  deleteProject: baseProcedure
    .input(
      z.object({
        id: Uuid(),
        confirmName: ProjectName(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: opts.input.id,
        confirmName: opts.input.confirmName,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return {};
    }),
  createSdkKey: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
        environmentId: Uuid(),
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional().default(''),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
        currentUserEmail: opts.ctx.currentUserEmail,
        name: opts.input.name,
        description: opts.input.description ?? '',
        projectId: opts.input.projectId,
        environmentId: opts.input.environmentId,
      });
    }),
  getProjectUsers: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.getProjectUsers(GLOBAL_CONTEXT, {
        projectId: opts.input.projectId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  getProjectEnvironments: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: opts.input.projectId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  createProjectEnvironment: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
        name: z.string().min(1).max(50),
        copyFromEnvironmentId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
        projectId: opts.input.projectId,
        name: opts.input.name,
        copyFromEnvironmentId: opts.input.copyFromEnvironmentId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  updateProjectEnvironment: baseProcedure
    .input(
      z.object({
        environmentId: Uuid(),
        name: z.string().min(1).max(50),
        projectId: Uuid(),
        requireProposals: z.boolean(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.updateProjectEnvironment(GLOBAL_CONTEXT, {
        environmentId: opts.input.environmentId,
        name: opts.input.name,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
        requireProposals: opts.input.requireProposals,
      });
    }),
  deleteProjectEnvironment: baseProcedure
    .input(
      z.object({
        environmentId: Uuid(),
        projectId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.deleteProjectEnvironment(GLOBAL_CONTEXT, {
        environmentId: opts.input.environmentId,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
    }),
  updateProjectEnvironmentsOrder: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
        environmentOrders: z.array(
          z.object({
            environmentId: Uuid(),
            order: z.number().int().min(0),
          }),
        ),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.updateProjectEnvironmentsOrder(GLOBAL_CONTEXT, {
        projectId: opts.input.projectId,
        environmentOrders: opts.input.environmentOrders,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  updateProjectUsers: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
        users: z.array(
          z.object({
            email: Email(),
            role: z.enum(['maintainer', 'admin']),
          }),
        ),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.updateProjectUsers(GLOBAL_CONTEXT, {
        projectId: opts.input.projectId,
        users: opts.input.users,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  restoreConfigVersion: baseProcedure
    .input(
      z.object({
        configId: Uuid(),
        versionToRestore: z.number(),
        expectedCurrentVersion: z.number(),
        projectId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const result = await opts.ctx.engine.useCases.restoreConfigVersion(GLOBAL_CONTEXT, {
        configId: opts.input.configId,
        versionToRestore: opts.input.versionToRestore,
        expectedCurrentVersion: opts.input.expectedCurrentVersion,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return result;
    }),
  deleteSdkKey: baseProcedure
    .input(
      z.object({
        id: Uuid(),
        projectId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.deleteSdkKey(GLOBAL_CONTEXT, {
        id: opts.input.id,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return {};
    }),
  createProject: baseProcedure
    .input(
      z.object({
        workspaceId: Uuid(),
        name: z.string().min(1).max(100),
        description: z.string().max(1_000_000).default(''),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const {projectId} = await opts.ctx.engine.useCases.createProject(GLOBAL_CONTEXT, {
        currentUserEmail: opts.ctx.currentUserEmail,
        workspaceId: opts.input.workspaceId,
        name: opts.input.name,
        description: opts.input.description,
      });
      return {projectId};
    }),
  getAuditLog: baseProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        authorEmails: z.array(z.string()).optional(),
        configNames: z.array(z.string()).optional(),
        limit: z.number().min(1).max(200).default(50),
        projectId: Uuid(),
        cursor: z
          .object({
            createdAt: z.coerce.date(),
            id: z.string().uuid(),
          })
          .nullish(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const {messages, nextCursor} = await opts.ctx.engine.useCases.getAuditLog(GLOBAL_CONTEXT, {
        currentUserEmail: opts.ctx.currentUserEmail,
        from: opts.input.from,
        to: opts.input.to,
        authorEmails: opts.input.authorEmails,
        configNames: opts.input.configNames,
        limit: opts.input.limit,
        cursor: opts.input.cursor ?? undefined,
        projectId: opts.input.projectId,
      });
      return {messages, nextCursor};
    }),
  getAuditLogMessage: baseProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const {message} = await opts.ctx.engine.useCases.getAuditLogMessage(GLOBAL_CONTEXT, {
        id: opts.input.id,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return {message};
    }),
  createConfigProposal: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
        configId: Uuid(),
        baseVersion: z.number(),
        proposedDelete: z.boolean(),
        description: ConfigDescription(),
        editorEmails: EditorArray(),
        maintainerEmails: MaintainerArray(),
        defaultVariant: z.object({
          value: ConfigValue(),
          schema: ConfigSchema().nullable(),
          overrides: ConfigOverrides(),
        }),
        environmentVariants: z.array(
          z.object({
            environmentId: Uuid(),
            value: ConfigValue(),
            schema: ConfigSchema().nullable(),
            overrides: ConfigOverrides(),
            useDefaultSchema: z.boolean(),
          }),
        ),
        message: z.string().max(5000).nullable(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const {configProposalId} = await opts.ctx.engine.useCases.createConfigProposal(
        GLOBAL_CONTEXT,
        {
          projectId: opts.input.projectId,
          configId: opts.input.configId,
          baseVersion: opts.input.baseVersion,
          proposedDelete: opts.input.proposedDelete,
          description: opts.input.description,
          editorEmails: opts.input.editorEmails,
          maintainerEmails: opts.input.maintainerEmails,
          defaultVariant: opts.input.defaultVariant,
          environmentVariants: opts.input.environmentVariants,
          message: opts.input.message,
          currentUserEmail: opts.ctx.currentUserEmail,
        },
      );
      return {configProposalId};
    }),
  approveConfigProposal: baseProcedure
    .input(
      z.object({
        proposalId: Uuid(),
        projectId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: opts.input.proposalId,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return {};
    }),
  rejectConfigProposal: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
        proposalId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
        projectId: opts.input.projectId,
        proposalId: opts.input.proposalId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return {};
    }),
  rejectAllPendingConfigProposals: baseProcedure
    .input(
      z.object({
        configId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
        configId: opts.input.configId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return {};
    }),
  getConfigProposal: baseProcedure
    .input(
      z.object({
        proposalId: Uuid(),
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const result = await opts.ctx.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
        proposalId: opts.input.proposalId,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return result;
    }),
  getConfigProposalList: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
        configIds: z.array(Uuid()).optional(),
        proposalIds: z.array(Uuid()).optional(),
        statuses: z.array(z.enum(['pending', 'approved', 'rejected'])).optional(),
        createdAtGte: z.coerce.date().optional(),
        createdAtLt: z.coerce.date().optional(),
        approvedAtGte: z.coerce.date().optional(),
        approvedAtLt: z.coerce.date().optional(),
        rejectedAtGte: z.coerce.date().optional(),
        rejectedAtLt: z.coerce.date().optional(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const {proposals} = await opts.ctx.engine.useCases.getConfigProposalList(GLOBAL_CONTEXT, {
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
        configIds: opts.input.configIds,
        proposalIds: opts.input.proposalIds,
        statuses: opts.input.statuses,
        createdAtGte: opts.input.createdAtGte,
        createdAtLt: opts.input.createdAtLt,
        approvedAtGte: opts.input.approvedAtGte,
        approvedAtLt: opts.input.approvedAtLt,
        rejectedAtGte: opts.input.rejectedAtGte,
        rejectedAtLt: opts.input.rejectedAtLt,
      });
      return {proposals};
    }),
  addExampleConfigs: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const result = await opts.ctx.engine.useCases.addExampleConfigs(GLOBAL_CONTEXT, {
        projectId: opts.input.projectId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return result;
    }),
});

export type AppRouter = typeof appRouter;
