import {Config} from '@/engine/core/config-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
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
        config: Config(),
      }),
    )
    .mutation(async opts => {
      await opts.ctx.engine.useCases.createConfig(GLOBAL_CONTEXT, {config: opts.input.config});
      return {};
    }),
  updateConfig: baseProcedure
    .input(
      z.object({
        config: Config(),
      }),
    )
    .mutation(async opts => {
      await opts.ctx.engine.useCases.updateConfig(GLOBAL_CONTEXT, {config: opts.input.config});
      return {};
    }),
  getConfig: baseProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query(async opts => {
      const config = await opts.ctx.engine.useCases.getConfig(GLOBAL_CONTEXT, {name: opts.input.name});
      return config;
    }),
});

export type AppRouter = typeof appRouter;
