/**
 * k6 Combined Load Test
 *
 * Runs both Admin API and SSE streaming tests in parallel.
 * This simulates real-world usage where admins update configs
 * while SDK clients are streaming.
 *
 * Usage:
 *   Local:  ./k6 run dist/combined.js  (requires custom k6 build with xk6-sse)
 *
 * Environment variables:
 *   REPLANE_ADMIN_URL     - Admin API URL (default: http://localhost:8080)
 *   REPLANE_EDGE_URL      - Edge API URL (default: http://localhost:8080)
 *   REPLANE_API_KEY       - Admin API key
 *   TEST_DURATION         - Test duration (default: 2m)
 *   ADMIN_VUS             - Admin API virtual users (default: 10)
 *   SSE_VUS               - SSE connection virtual users (default: 100)
 */

import {check, sleep} from 'k6';
import {Counter, Rate, Trend} from 'k6/metrics';
import {Options} from 'k6/options';
import sse, {SSEClient, SSEError, SSEEvent, SSEParams} from 'k6/x/sse';
import {createAdminClient} from './lib/admin-client.ts';
import {config as testConfig} from './lib/config.ts';
import {pickRandom, randomConfig} from './lib/utils.ts';

// ============= Admin API Metrics =============
const adminRequests = new Counter('admin_requests');
const adminErrors = new Counter('admin_errors');
const adminSuccesses = new Rate('admin_success');
const adminLatency = new Trend('admin_latency', true);

// ============= SSE Metrics =============
const sseConnectionErrors = new Counter('sse_connection_errors');
const sseConnectionFailures = new Counter('sse_connection_failures');
const sseConnectionRequests = new Counter('sse_connections');
const sseConnectionSuccess = new Rate('sse_connection_success');
const sseOpened = new Counter('sse_opened');
const sseGotFirstMessage = new Counter('sse_got_first_message');
const seeGotInitMessage = new Counter('sse_got_init_message');
const sseClosed = new Counter('sse_closed');
const sseFinished = new Counter('sse_finished');
const sseMessages = new Counter('sse_messages');
const sseConfigUpdateMessages = new Counter('sse_config_update_messages');
const sseTimeToOpened = new Trend('sse_time_to_opened', true);
const sseTimeToFirstMessage = new Trend('sse_time_to_first_message', true);
const sseTimeToInitMessage = new Trend('sse_time_to_init_message', true);
const sseTimeToClosed = new Trend('sse_time_closed', true);
const sseTimeToFinished = new Trend('sse_time_to_finished', true);

// Test options with multiple scenarios
export const options: Options = {
  scenarios: {
    // Admin API scenario
    admin_api: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        {duration: testConfig.rampUpTime, target: testConfig.adminVUs},
        {duration: testConfig.testDuration, target: testConfig.adminVUs},
        {duration: testConfig.rampDownTime, target: 0},
      ],
      gracefulRampDown: '30s',
      exec: 'adminTest',
      tags: {scenario: 'admin'},
    },
    // SSE streaming scenario
    sse_stream: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        {duration: testConfig.rampUpTime, target: testConfig.sseVUs},
        {duration: testConfig.testDuration, target: testConfig.sseVUs},
        {duration: testConfig.rampDownTime, target: 0},
      ],
      gracefulRampDown: '30s',
      exec: 'sseTest',
      tags: {scenario: 'sse'},
    },
  },
  thresholds: {
    // Admin API thresholds
    admin_latency: ['p(95)<100', 'p(99)<200'],
    admin_success: ['rate>0.99'],

    // SSE connection thresholds
    sse_connection_success: ['rate>0.99'],

    // SSE timing thresholds
    sse_time_to_opened: ['p(95)<200', 'p(99)<500'],
    sse_time_to_first_message: ['p(95)<200', 'p(99)<500'],
    sse_time_to_init_message: ['p(95)<200', 'p(99)<500'],
    sse_time_to_finished: ['p(95)>30000'],
  },
};

// Combined test data interface
interface TestContext {
  edgeUrl: string;
  adminUrl: string;
  apiKey: string;
  workspaceId: string;
  projects: Array<{
    projectId: string;
    sdkKey: string;
    configNames: string[];
    envIds: string[];
  }>;
}

// ============= Setup =============
export function setup(): TestContext {
  console.log('=== Combined Load Test Setup ===');
  console.log(`Admin VUs: ${testConfig.adminVUs}`);
  console.log(`SSE VUs: ${testConfig.sseVUs}`);
  console.log(`Duration: ${testConfig.testDuration}`);
  console.log(`Projects: ${testConfig.projectsCount}`);

  const adminApi = createAdminClient({
    baseUrl: testConfig.adminUrl,
    apiKey: testConfig.superadminApiKey,
  });

  const workspaceData = adminApi.workspaces.create({
    name: 'benchmark-workspace',
  });

  if (!workspaceData.ok) {
    throw new Error('Failed to create workspace');
  }

  const workspaceId = workspaceData.data.id;

  const projects: TestContext['projects'] = [];

  for (let i = 0; i < testConfig.projectsCount; i++) {
    const projectData = adminApi.projects.create({
      workspaceId,
      name: `benchmark-project-${i + 1}`,
      description: `Benchmark project ${i + 1}`,
    });

    if (!projectData.ok) {
      throw new Error(`Failed to create project ${i + 1}`);
    }

    const projectId = projectData.data.id;

    const environmentData = adminApi.environments.list({
      projectId,
    });

    if (!environmentData.ok) {
      throw new Error(`Failed to list environments for project ${projectId}`);
    }

    if (environmentData.data.environments.length === 0) {
      throw new Error(`No environments found for project ${projectId}`);
    }

    const envId = environmentData.data.environments[0].id;
    const envIds = environmentData.data.environments.map(e => e.id);

    const configs = Array.from({length: 10}, () => randomConfig(envIds));
    for (const config of configs) {
      const configData = adminApi.configs.create({
        base: config.base,
        variants: config.variants,
        editors: config.editors,
        maintainers: [],
        projectId,
        name: config.name,
        description: config.description ?? '',
      });

      if (!configData.ok) {
        throw new Error(`Failed to create config for project ${projectId}`);
      }
    }

    const sdkKeyData = adminApi.sdkKeys.create({
      projectId,
      name: `benchmark-sdk-key-${i + 1}`,
      description: `Benchmark SDK key ${i + 1}`,
      environmentId: envId,
    });

    if (!sdkKeyData.ok) {
      throw new Error(`Failed to create SDK key for project ${projectId}`);
    }

    projects.push({
      projectId,
      sdkKey: sdkKeyData.data.key,
      configNames: configs.map(c => c.name),
      envIds,
    });
  }

  return {
    edgeUrl: testConfig.edgeUrl,
    adminUrl: testConfig.adminUrl,
    apiKey: testConfig.superadminApiKey,
    workspaceId,
    projects,
  };
}

// ============= Admin API Test =============
export function adminTest(ctx: TestContext): void {
  const client = createAdminClient({
    baseUrl: ctx.adminUrl,
    apiKey: ctx.apiKey,
  });

  const project = pickRandom(ctx.projects);

  const startTime = Date.now();
  const config = randomConfig(project.envIds);
  const result = client.configs.update({
    projectId: project.projectId,
    configName: pickRandom(project.configNames),
    description: config.description ?? '',
    editors: config.editors,
    base: config.base,
    variants: config.variants,
  });
  if (!result.ok) {
    console.error(`Admin API update failed: ${result.error}`);
  }
  const duration = Date.now() - startTime;

  adminRequests.add(1);
  adminLatency.add(duration);

  adminSuccesses.add(result.ok ? 1 : 0);
  adminErrors.add(result.ok ? 0 : 1);

  sleep(testConfig.adminRequestDelay / 1000);
}

// ============= SSE Stream Test =============
export function sseTest(data: TestContext): void {
  const project = pickRandom(data.projects);
  const {edgeUrl} = data;
  const {sdkKey} = project;

  const sseUrl = `${edgeUrl}/api/sdk/v1/replication/stream`;
  const startTime = Date.now();
  let firstMessageTime: number | null = null;
  let initMessageTime: number | null = null;

  sseConnectionRequests.add(1);

  const params: SSEParams = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sdkKey}`,
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
      'x-stream-timeout-ms': String(testConfig.sseTimeoutMs),
    },
    body: JSON.stringify({}),
  };

  let openedAt: number | null = null;

  const response = sse.open(sseUrl, params, function (client: SSEClient) {
    client.on('open', function () {
      sseOpened.add(1);
      sseTimeToOpened.add(Date.now() - startTime);
      openedAt = Date.now();
    });

    client.on('event', function (event: SSEEvent) {
      sseMessages.add(1);

      if (firstMessageTime === null) {
        firstMessageTime = Date.now();
        sseTimeToFirstMessage.add(firstMessageTime - startTime);
        sseGotFirstMessage.add(1);
      }

      if (event.data) {
        if (initMessageTime === null) {
          initMessageTime = Date.now();
          sseTimeToInitMessage.add(initMessageTime - startTime);
          seeGotInitMessage.add(1);
        } else {
          sseConfigUpdateMessages.add(1);
        }
      }
    });

    client.on('error', function (e: SSEError) {
      console.error(`SSE error: ${e.error()}`);
      sseConnectionErrors.add(1);
    });
  });

  sseConnectionErrors.add(0);

  if (openedAt) {
    sseClosed.add(1);
    sseTimeToClosed.add(Date.now() - openedAt);
  }

  sseFinished.add(1);
  sseTimeToFinished.add(Date.now() - startTime);

  const success = check(response, {
    'SSE connection status is 200': r => r && r.status === 200,
  });

  sseConnectionSuccess.add(success ? 1 : 0);

  if (!success) {
    const status = response ? response.status : 'unknown';
    console.error(`SSE connection failed: ${status}: ${response.body}`, response.error);
  }
  sseConnectionFailures.add(success ? 0 : 1);
}

// ============= Teardown =============
export function teardown(ctx: TestContext): void {
  console.log('=== Test Completed ===');
  const client = createAdminClient({
    baseUrl: testConfig.adminUrl,
    apiKey: testConfig.superadminApiKey,
  });

  const result = client.workspaces.delete({workspaceId: ctx.workspaceId});
  if (!result.ok) {
    console.error(`Failed to delete workspace ${ctx.workspaceId}: ${result.error}`);
  }
}
