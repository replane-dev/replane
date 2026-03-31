import {isPrometheusMetricsEnabled} from '@/environment';
import {collectDefaultMetrics, register} from 'prom-client';

collectDefaultMetrics();

export async function GET() {
  if (!isPrometheusMetricsEnabled()) {
    return new Response('Not Found', {status: 404});
  }

  const metrics = await register.metrics();

  return new Response(metrics, {
    status: 200,
    headers: {
      'Content-Type': register.contentType,
    },
  });
}
