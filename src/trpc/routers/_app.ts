import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {CreateConfigRequest} from '@/engine/core/use-cases/create-config-use-case';
import {UpdateConfigRequest} from '@/engine/core/use-cases/update-config-use-case';
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
  createConfig: baseProcedure.input(CreateConfigRequest()).mutation(async opts => {
    await opts.ctx.engine.useCases.createConfig(GLOBAL_CONTEXT, opts.input);
    return {};
  }),
  updateConfig: baseProcedure.input(UpdateConfigRequest()).mutation(async opts => {
    await opts.ctx.engine.useCases.updateConfig(GLOBAL_CONTEXT, opts.input);
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
