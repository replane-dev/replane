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
        name: ConfigName(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.currentUserEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        name: opts.input.name,
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
});

export type AppRouter = typeof appRouter;
