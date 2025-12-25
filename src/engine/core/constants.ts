export const CONFIGS_REPLICA_PULL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const REPLICA_STEP_INTERVAL_MS = 100;
export const REPLICA_CLEANUP_FREQUENCY = 128; // every Nth push of events we cleanup old consumers
export const REPLICA_LAST_USED_AT_CUTOFF_MS = 24 * 60 * 60 * 1000; // 24 hours
const REPLICA_LAST_USED_AT_REPORT_INTERVAL_MS = 30 * 1000; // 30 seconds
export const REPLICA_LAST_USED_AT_REPORT_FREQUENCY = Math.floor(
  REPLICA_LAST_USED_AT_REPORT_INTERVAL_MS / REPLICA_STEP_INTERVAL_MS,
); // every Nth pull of events we report the last used at
export const REPLICA_STEP_EVENTS_COUNT = 1000;
export const REPLICA_CONFIGS_DUMP_BATCH_SIZE = 1000;

export const ENGINE_STOP_TIMEOUT_MS = 10 * 1000;
export const MAX_CONFIG_VERSION = 1_000_000_007;

export const JWT_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 hours

export const MAGIC_LINK_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 hours

export const MIN_PASSWORD_LENGTH = 8;

export const AUTH_MAX_REQUESTS_PER_WINDOW = 10;
export const AUTH_MAX_REQUESTS_WINDOW_MS = 60 * 1000;

// Image upload constants
export const MAX_IMAGE_UPLOAD_SIZE = 2 * 1024 * 1024; // 2MB
export const ACCEPTED_IMAGE_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];
export const ACCEPTED_IMAGE_TYPES_REGEX = /^data:image\/(png|jpeg|jpg|webp|gif);base64,.+$/i;
export const LOGO_SIZE = 128; // pixels

export const PASSWORD_PROVIDER_NAME = 'Email';

// API Key display constants
export const API_KEY_PREFIX_LENGTH = 4; // Number of hex chars to show as prefix (after rp_/rpa_)
export const API_KEY_SUFFIX_LENGTH = 4; // Number of hex chars to show as suffix
