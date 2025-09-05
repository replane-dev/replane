import {v7 as uuidV7} from 'uuid';

export type Uuid = string;

export function createUuidV7() {
  return uuidV7();
}
