/**
 * Shared configuration for k6 tests
 * Works with both local and k6 cloud environments
 */

export interface Config {
  adminUrl: string;
  edgeUrl: string;
  superadminApiKey: string;
  testDuration: string;
  rampUpTime: string;
  rampDownTime: string;
  adminVUs: number;
  adminRequestDelay: number;
  sseVUs: number;
  sseTimeoutMs: number;
  projectsCount: number;
}

function getEnv(name: string): string {
  const value = __ENV[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

// Environment-based configuration
export const config: Config = {
  // Replane endpoints
  adminUrl: getEnv("REPLANE_ADMIN_URL"),
  edgeUrl: getEnv("REPLANE_EDGE_URL"),

  // Authentication (superadmin key for setup/teardown)
  superadminApiKey: getEnv("REPLANE_SUPERADMIN_API_KEY"),

  // Test parameters
  testDuration: getEnv("TEST_DURATION"),
  rampUpTime: getEnv("RAMP_UP_TIME"),
  rampDownTime: getEnv("RAMP_DOWN_TIME"),

  // Admin API settings
  adminVUs: parseInt(getEnv("ADMIN_VUS")),
  adminRequestDelay: parseInt(getEnv("ADMIN_REQUEST_DELAY_MS")),

  // SSE settings
  sseVUs: parseInt(getEnv("SSE_VUS")),
  sseTimeoutMs: parseInt(getEnv("SSE_TIMEOUT_MS")),

  // Number of independent projects to create (each gets its own SDK key)
  projectsCount: parseInt(getEnv("PROJECTS_COUNT")),
};
