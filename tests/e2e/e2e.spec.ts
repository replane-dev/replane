import {testSuite} from '@replanejs/test-suite';

testSuite({
  superadminKey: process.env.SUPERUSER_API_KEY!,
  adminApiBaseUrl: process.env.REPLANE_ADMIN_API_BASE_URL!,
  edgeApiBaseUrl: process.env.REPLANE_EDGE_API_BASE_URL!,
  debug: true,
});
