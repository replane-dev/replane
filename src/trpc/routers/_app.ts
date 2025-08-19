import {Config} from '@/engine/core/config-store';
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
    const health = await (await opts.ctx).engine.useCases.getHealth({});
    return {health, status: 'ok'};
  }),
  getConfigNames: baseProcedure.query(async opts => {
    const configNames = await (await opts.ctx).engine.useCases.getConfigNames({});
    return configNames;
  }),
  putConfig: baseProcedure
    .input(
      z.object({
        config: Config(),
      }),
    )
    .mutation(async opts => {
      await (await opts.ctx).engine.useCases.putConfig({config: opts.input.config});
      return {};
    }),
});

export type AppRouter = typeof appRouter;
