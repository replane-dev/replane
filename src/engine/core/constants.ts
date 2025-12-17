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

export const MAGIC_LINK_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 hours
