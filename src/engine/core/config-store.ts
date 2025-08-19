import {z} from 'zod';

export function ConfigName() {
  return z.string().regex(/^[a-zA-Z0-9_]+$/);
}

export function Config() {
  return z.object({
    name: ConfigName(),
    value: z.unknown(),
    version: z.number(),
  });
}

export interface Config extends z.infer<ReturnType<typeof Config>> {}

export interface ConfigStoreGetOptions {
  consistent?: boolean;
}

export class ConflictError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConflictError';
  }
}

export interface ConfigStore {
  getAll(): Promise<Config[]>;
  get(name: string, options?: ConfigStoreGetOptions): Promise<Config | undefined>;
  put(config: Config): Promise<void>;
}
