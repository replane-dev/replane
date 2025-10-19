import {ConfigDescription, ConfigName, ConfigSchema, ConfigValue} from '@/engine/core/config-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {ProjectDescription, ProjectName} from '@/engine/core/project-store';
import {ConfigMember, EditorArray, Email, OwnerArray, Uuid} from '@/engine/core/zod';
import {TRPCError} from '@trpc/server';
import {z} from 'zod';
import {baseProcedure, createTRPCRouter} from '../init';

export const appRouter = createTRPCRouter({
  getOrganization: baseProcedure.query(async () => {
    const name = process.env.ORGANIZATION_NAME?.trim();
    return {name: name && name.length > 0 ? name : null};
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
        editorEmails: EditorArray(),
        ownerEmails: OwnerArray(),
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
        value: z.object({newValue: ConfigValue()}).optional(),
        schema: z.object({newSchema: ConfigSchema()}).optional(),
        description: z.object({newDescription: ConfigDescription()}).optional(),
        prevVersion: z.number(),
        members: z
          .object({
            newMembers: z.array(ConfigMember()),
          })
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
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId: opts.input.configId,
        currentUserEmail: opts.ctx.currentUserEmail,
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
  getConfigVersionList: baseProcedure
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
      const result = await opts.ctx.engine.useCases.getConfigVersionList(GLOBAL_CONTEXT, {
        name: opts.input.name,
        currentUserEmail: opts.ctx.currentUserEmail,
        projectId: opts.input.projectId,
      });
      return result;
    }),
  getConfigVersion: baseProcedure
    .input(
      z.object({
        name: z.string(),
        version: z.number(),
        projectId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const result = await opts.ctx.engine.useCases.getConfigVersion(GLOBAL_CONTEXT, {
        name: opts.input.name,
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
          })
          .optional(),
        members: z
          .object({
            users: z.array(
              z.object({
                email: Email(),
                role: z.enum(['owner', 'admin']),
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
  updateProjectUsers: baseProcedure
    .input(
      z.object({
        projectId: Uuid(),
        users: z.array(
          z.object({
            email: Email(),
            role: z.enum(['owner', 'admin']),
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
        name: z.string(),
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
        name: opts.input.name,
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
        configId: Uuid(),
        proposedValue: z.object({newValue: ConfigValue()}).optional(),
        proposedDescription: z.object({newDescription: ConfigDescription()}).optional(),
        proposedSchema: z.object({newSchema: ConfigSchema()}).optional(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const {configProposalId} = await opts.ctx.engine.useCases.createConfigProposal(
        GLOBAL_CONTEXT,
        {
          configId: opts.input.configId,
          proposedValue: opts.input.proposedValue,
          proposedDescription: opts.input.proposedDescription,
          proposedSchema: opts.input.proposedSchema,
          currentUserEmail: opts.ctx.currentUserEmail,
        },
      );
      return {configProposalId};
    }),
  approveConfigProposal: baseProcedure
    .input(
      z.object({
        proposalId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: opts.input.proposalId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return {};
    }),
  rejectConfigProposal: baseProcedure
    .input(
      z.object({
        proposalId: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
        proposalId: opts.input.proposalId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return {};
    }),
  getConfigProposal: baseProcedure
    .input(
      z.object({
        proposalId: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const {proposal} = await opts.ctx.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
        proposalId: opts.input.proposalId,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return {proposal};
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
