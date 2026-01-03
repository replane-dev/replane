/**
 * Prometheus text format parser for k6 tests
 */

/**
 * Parses Prometheus text format and extracts metric values.
 * Handles both simple metrics and metrics with labels.
 *
 * Format examples:
 *   process_cpu_seconds_total 123.45
 *   nodejs_eventloop_lag_seconds{quantile="0.9"} 0.001
 */
export function parsePrometheusMetrics(text: string): Record<string, number> {
  const metrics: Record<string, number> = {};
  const lines = text.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }

    // Match metric name (with optional labels) and value
    // Examples:
    //   metric_name 123.45
    //   metric_name{label="value"} 123.45
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+(-?\d+\.?\d*(?:e[+-]?\d+)?)/);
    if (match) {
      const [, name, value] = match;
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        metrics[name] = numValue;
      }
    }

    // Also try to match metrics with labels for specific quantiles we care about
    // nodejs_eventloop_lag_seconds{quantile="0.9"} -> nodejs_eventloop_lag_p90_seconds
    const labeledMatch = line.match(
      /^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]+)\}\s+(-?\d+\.?\d*(?:e[+-]?\d+)?)/,
    );
    if (labeledMatch) {
      const [, name, labels, value] = labeledMatch;
      const numValue = parseFloat(value);

      if (!isNaN(numValue)) {
        // Handle eventloop lag quantiles specifically
        if (name === 'nodejs_eventloop_lag_seconds') {
          if (labels.includes('quantile="0.9"')) {
            metrics['nodejs_eventloop_lag_p90_seconds'] = numValue;
          } else if (labels.includes('quantile="0.99"')) {
            metrics['nodejs_eventloop_lag_p99_seconds'] = numValue;
          }
        }
      }
    }
  }

  return metrics;
}







