import {v4 as uuidV4, v7 as uuidV7} from 'uuid';

export type Uuid = string;

export function createUuidV7() {
  return uuidV7();
}

export function createUuidV4() {
  return uuidV4();
}
