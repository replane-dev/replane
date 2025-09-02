import {ConfigDescription, ConfigName, ConfigSchema, ConfigValue} from '@/engine/core/config-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {EditorArray, OwnerArray} from '@/engine/core/zod';
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
    const configList = await opts.ctx.engine.useCases.getConfigList(GLOBAL_CONTEXT, {});
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
      if (!opts.ctx.accountEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        ...opts.input,
        currentUserEmail: opts.ctx.accountEmail,
      });
      return {};
    }),
  updateConfig: baseProcedure
    .input(
      z.object({
        configName: ConfigName(),
        value: ConfigValue(),
        schema: ConfigSchema(),
        description: ConfigDescription().optional(),
        editorEmails: EditorArray(),
        ownerEmails: OwnerArray(),
      }),
    )
    .mutation(async opts => {
      if (!opts.ctx.accountEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        ...opts.input,
        currentUserEmail: opts.ctx.accountEmail,
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
      if (!opts.ctx.accountEmail) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'User is not authenticated'});
      }
      await opts.ctx.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {name: opts.input.name});
      return {};
    }),
  getConfig: baseProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query(async opts => {
      const config = await opts.ctx.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: opts.input.name,
      });
      return config;
    }),
});

export type AppRouter = typeof appRouter;
