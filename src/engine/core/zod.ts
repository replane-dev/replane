import z from 'zod';
import type {Brand} from './utils';

export type NormalizedEmail = Brand<string, 'NormalizedEmail'>;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function Uuid() {
  return z.string().regex(UUID_REGEX);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Email() {
  return z.string().regex(EMAIL_REGEX);
}

export function OwnerArray() {
  return z.array(Email()).max(100);
}

export function EditorArray() {
  return z.array(Email()).max(100);
}

export function ConfigMember() {
  return z.object({
    email: Email(),
    role: z.enum(['owner', 'editor', 'viewer']),
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
    myRole: z.enum(['owner', 'editor', 'viewer']),
    version: z.number(),
  });
}

export interface ConfigInfo extends z.infer<ReturnType<typeof ConfigInfo>> {}
