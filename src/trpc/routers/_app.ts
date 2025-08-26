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
    return await (await opts.ctx).engine.useCases.getHealth(GLOBAL_CONTEXT, {});
  }),
  getConfigNames: baseProcedure.query(async opts => {
    const configNames = await (await opts.ctx).engine.useCases.getConfigNames(GLOBAL_CONTEXT, {});
    return configNames;
  }),
  putConfig: baseProcedure
    .input(
      z.object({
        config: Config(),
      }),
    )
    .mutation(async opts => {
      await (await opts.ctx).engine.useCases.putConfig(GLOBAL_CONTEXT, {config: opts.input.config});
      return {};
    }),
});

export type AppRouter = typeof appRouter;
