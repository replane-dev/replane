import {getAuthOptions} from '@/app/auth-options';
import {
  ConfigDescription,
  ConfigName,
  ConfigOverrides,
  ConfigSchema,
  ConfigValue,
} from '@/engine/core/config-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {OrganizationName} from '@/engine/core/organization-store';
import {ProjectDescription, ProjectName} from '@/engine/core/project-store';
import {ConfigMember, EditorArray, Email, MaintainerArray, Uuid} from '@/engine/core/zod';
import {TRPCError} from '@trpc/server';
import {z} from 'zod';
import {baseProcedure, createTRPCRouter} from '../init';

export const appRouter = createTRPCRouter({
  getOrganization: baseProcedure.input(z.object({organizationId: Uuid()})).query(async opts => {
    if (!opts.ctx.currentUserEmail) {
      throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
    }
    return await opts.ctx.engine.useCases.getOrganization(GLOBAL_CONTEXT, {
      organizationId: opts.input.organizationId,
      currentUserEmail: opts.ctx.currentUserEmail,
    });
  }),
  getOrganizationList: baseProcedure.query(async opts => {
    if (!opts.ctx.currentUserEmail) {
      throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
    }
    return await opts.ctx.engine.useCases.getOrganizationList(GLOBAL_CONTEXT, {
      currentUserEmail: opts.ctx.currentUserEmail,
    });
  }),
  createOrganization: baseProcedure
    .input(
      z.object({
        name: OrganizationName(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
        currentUserEmail: opts.ctx.currentUserEmail,
        name: opts.input.name,
      });
    }),
  updateOrganization: baseProcedure
    .input(
      z.object({
        organizationId: Uuid(),
        name: OrganizationName(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.updateOrganization(GLOBAL_CONTEXT, {
        organizationId: opts.input.organizationId,
        currentUserEmail: opts.ctx.currentUserEmail,
        name: opts.input.name,
      });
    }),
  deleteOrganization: baseProcedure
    .input(z.object({organizationId: Uuid()}))
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.deleteOrganization(GLOBAL_CONTEXT, {
        organizationId: opts.input.organizationId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  getOrganizationMembers: baseProcedure
    .input(z.object({organizationId: Uuid()}))
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.getOrganizationMembers(GLOBAL_CONTEXT, {
        organizationId: opts.input.organizationId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  addOrganizationMember: baseProcedure
    .input(
      z.object({
        organizationId: Uuid(),
        memberEmail: Email(),
        role: z.enum(['admin', 'member']),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.addOrganizationMember(GLOBAL_CONTEXT, {
        organizationId: opts.input.organizationId,
        currentUserEmail: opts.ctx.currentUserEmail,
        memberEmail: opts.input.memberEmail,
        role: opts.input.role,
      });
    }),
  removeOrganizationMember: baseProcedure
    .input(
      z.object({
        organizationId: Uuid(),
        memberEmail: Email(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.removeOrganizationMember(GLOBAL_CONTEXT, {
        organizationId: opts.input.organizationId,
        currentUserEmail: opts.ctx.currentUserEmail,
        memberEmail: opts.input.memberEmail,
      });
    }),
  updateOrganizationMemberRole: baseProcedure
    .input(
      z.object({
        organizationId: Uuid(),
        memberEmail: Email(),
        role: z.enum(['admin', 'member']),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.updateOrganizationMemberRole(GLOBAL_CONTEXT, {
        organizationId: opts.input.organizationId,
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
        value: ConfigValue(),
        description: ConfigDescription(),
        schema: ConfigSchema(),
        overrides: ConfigOverrides(),
        editorEmails: EditorArray(),
        maintainerEmails: MaintainerArray(),
        projectId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        ...opts.input,
        projectId: opts.input.projectId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return {};
    }),
  patchConfig: baseProcedure
    .input(
      z.object({
        configId: Uuid(),
        description: z.object({newDescription: ConfigDescription()}).optional(),
        prevVersion: z.number(),
        members: z
          .object({
            newMembers: z.array(ConfigMember()),
          })
          .optional(),
        variants: z
          .array(
            z.object({
              configVariantId: Uuid(),
              prevVersion: z.number(),
              value: z.object({newValue: z.any()}).optional(),
              schema: z.object({newSchema: z.any()}).optional(),
              overrides: z.object({newOverrides: ConfigOverrides()}).optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
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
        environmentId: Uuid(),
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
        environmentId: opts.input.environmentId,
        version: opts.input.version,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return result;
    }),
  getApiKeyList: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
    }),
  getApiKey: baseProcedure
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
      return await opts.ctx.engine.useCases.getApiKey(GLOBAL_CONTEXT, {
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
  updateProject: baseProcedure
    .input(
      z.object({
        id: Uuid(),
        name: ProjectName(),
        description: ProjectDescription(),
        requireProposals: z.boolean(),
        allowSelfApprovals: z.boolean(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.updateProject(GLOBAL_CONTEXT, {
        id: opts.input.id,
        name: opts.input.name,
        description: opts.input.description,
        requireProposals: opts.input.requireProposals,
        allowSelfApprovals: opts.input.allowSelfApprovals,
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
  createApiKey: baseProcedure
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
      return await opts.ctx.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
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
      });
    }),
  deleteProjectEnvironment: baseProcedure
    .input(
      z.object({
        environmentId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.deleteProjectEnvironment(GLOBAL_CONTEXT, {
        environmentId: opts.input.environmentId,
        currentUserEmail: opts.ctx.currentUserEmail,
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
  restoreConfigVariantVersion: baseProcedure
    .input(
      z.object({
        configId: Uuid(),
        environmentId: Uuid(),
        versionToRestore: z.number(),
        expectedCurrentVersion: z.number(),
        projectId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const result = await opts.ctx.engine.useCases.restoreConfigVariantVersion(GLOBAL_CONTEXT, {
        configId: opts.input.configId,
        environmentId: opts.input.environmentId,
        versionToRestore: opts.input.versionToRestore,
        expectedCurrentVersion: opts.input.expectedCurrentVersion,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return result;
    }),
  deleteApiKey: baseProcedure
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
      await opts.ctx.engine.useCases.deleteApiKey(GLOBAL_CONTEXT, {
        id: opts.input.id,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return {};
    }),
  createProject: baseProcedure
    .input(
      z.object({
        organizationId: Uuid(),
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
        organizationId: opts.input.organizationId,
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
        proposedDelete: z.boolean().optional(),
        proposedDescription: z.object({newDescription: ConfigDescription()}).optional(),
        proposedMembers: z
          .object({
            newMembers: z.array(ConfigMember()),
          })
          .optional(),
        proposedVariants: z
          .array(
            z.object({
              configVariantId: Uuid(),
              baseVariantVersion: z.number(),
              proposedValue: z.object({newValue: ConfigValue()}).optional(),
              proposedSchema: z.object({newSchema: ConfigSchema()}).optional(),
              proposedOverrides: z.object({newOverrides: ConfigOverrides()}).optional(),
            }),
          )
          .optional(),
        message: z.string().max(5000).optional(),
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
          proposedDescription: opts.input.proposedDescription,
          proposedMembers: opts.input.proposedMembers,
          proposedVariants: opts.input.proposedVariants,
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
});

export type AppRouter = typeof appRouter;
