import {ConfigDescription, ConfigName, ConfigSchema, ConfigValue} from '@/engine/core/config-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {ConfigMember, EditorArray, OwnerArray, Uuid} from '@/engine/core/zod';
import {TRPCError} from '@trpc/server';
import {z} from 'zod';
import {baseProcedure, createTRPCRouter} from '../init';

export const appRouter = createTRPCRouter({
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
  getConfigList: baseProcedure.query(async opts => {
    if (!opts.ctx.currentUserEmail) {
      throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
    }

    const configList = await opts.ctx.engine.useCases.getConfigList(GLOBAL_CONTEXT, {
      currentUserEmail: opts.ctx.currentUserEmail,
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
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }

      const config = await opts.ctx.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: opts.input.name,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return config;
    }),
  getConfigVersionList: baseProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      const result = await opts.ctx.engine.useCases.getConfigVersionList(GLOBAL_CONTEXT, {
        name: opts.input.name,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return result;
    }),
  getConfigVersion: baseProcedure
    .input(
      z.object({
        name: z.string(),
        version: z.number(),
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
      });
      return result;
    }),
  getApiKeyList: baseProcedure.query(async opts => {
    if (!opts.ctx.currentUserEmail) {
      throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
    }
    return await opts.ctx.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
      currentUserEmail: opts.ctx.currentUserEmail,
    });
  }),
  getApiKey: baseProcedure
    .input(
      z.object({
        id: Uuid(),
      }),
    )
    .query(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      return await opts.ctx.engine.useCases.getApiKey(GLOBAL_CONTEXT, {
        id: opts.input.id,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
    }),
  createApiKey: baseProcedure
    .input(
      z.object({
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
      });
    }),
  restoreConfigVersion: baseProcedure
    .input(
      z.object({
        name: z.string(),
        versionToRestore: z.number(),
        expectedCurrentVersion: z.number(),
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
      });
      return result;
    }),
  deleteApiKey: baseProcedure
    .input(
      z.object({
        id: Uuid(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.deleteApiKey(GLOBAL_CONTEXT, {
        id: opts.input.id,
        currentUserEmail: opts.ctx.currentUserEmail,
      });
      return {};
    }),
  getAuditLog: baseProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        authorEmails: z.array(z.string()).optional(),
        configNames: z.array(z.string()).optional(),
        limit: z.number().min(1).max(200).default(50),
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
});

export type AppRouter = typeof appRouter;
