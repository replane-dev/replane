import type {Context} from './context';

export interface Service {
  readonly name: string;
  start(ctx: Context): Promise<void>;
  stop(ctx: Context): Promise<void>;
}
