import z from 'zod';
import {isValidJsonSchema, type Brand} from './utils';

export type ConfigValue = Brand<unknown, 'ConfigValue'>;

export function ConfigValue() {
  return z
    .unknown()
    .refine(val => {
      return JSON.stringify(val).length < 1048576; // 1MB
    })
    .transform(val => val as ConfigValue);
}

export function asConfigValue(val: unknown): ConfigValue {
  return val as ConfigValue;
}

export function ConfigSchema() {
  return z
    .unknown()
    .refine(val => {
      return JSON.stringify(val).length < 131072; // 128KB
    })
    .refine(val => val === null || typeof val === 'boolean' || typeof val === 'object', {
      message: 'Schema must be a valid JSON object or boolean',
    })
    .refine(val => isValidJsonSchema(val), {
      message: 'This is not a valid JSON Schema — please check the structure',
    })
    .transform(val => val as ConfigSchema);
}

export function asConfigSchema(val: unknown): ConfigSchema {
  return val as ConfigSchema;
}

export type ConfigSchema = Brand<unknown, 'ConfigSchema'>;

export type NormalizedEmail = Brand<string, 'NormalizedEmail'>;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function Uuid() {
  return z.string().regex(UUID_REGEX);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Email() {
  return z.string().regex(EMAIL_REGEX);
}

export function MaintainerArray() {
  return z.array(Email()).max(100);
}

export function EditorArray() {
  return z.array(Email()).max(100);
}

export function ConfigMember() {
  return z.object({
    email: Email(),
    role: z.enum(['maintainer', 'editor']),
  });
}

export interface ConfigMember extends z.infer<ReturnType<typeof ConfigMember>> {}

export function ConfigInfo() {
  return z.object({
    id: Uuid(),
    name: z.string(),
    descriptionPreview: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    myRole: z.enum(['maintainer', 'editor', 'viewer']),
    version: z.number(),
    projectId: Uuid(),
  });
}

export interface ConfigInfo extends z.infer<ReturnType<typeof ConfigInfo>> {}
