import z from 'zod';

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
