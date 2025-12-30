# Replane Benchmark Suite

Load testing suite for Replane using [k6](https://k6.io/) with the [xk6-sse](https://github.com/phymbert/xk6-sse) extension.

## Performance Results

Tested on **macOS Tahoe, Apple M2 Pro, 32 GB RAM**:

| Metric                   | Result                                          |
| ------------------------ | ----------------------------------------------- |
| Concurrent clients       | **5,000** (can be higher with proper os tuning) |
| Config change throughput | **~4,000 messages/sec** to connected clients    |
| Node.js CPU usage        | ~1.5 cores                                      |
| Node.js memory usage     | ~2.7 GB (RSS)                                   |

Replane scales horizontally—add more instances behind a load balancer to increase throughput linearly.

## Features

- **Admin API Tests** - Config update operations under load
- **SSE Streaming Tests** - Concurrent SDK streaming connections
- **Metrics Scraping** - Collects Prometheus metrics from `/metrics` endpoint during tests
- **Combined Scenario** - All scenarios running in parallel (simulates real-world usage)
- **Prometheus Metrics Export** - Real-time k6 metrics export to Prometheus
- **Grafana Dashboards** - Pre-configured visualization

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) with [xk6-sse](https://github.com/phymbert/xk6-sse) extension
- Docker and Docker Compose
- Node.js 22+ and pnpm

### Installing k6 with xk6-sse

```bash
# Using xk6 to build k6 with SSE extension
go install go.k6.io/xk6/cmd/xk6@latest
xk6 build --with github.com/phymbert/xk6-sse

# Or use the pre-built binary from releases
```

## Quick Start

### 1. Start Infrastructure

From the `bench` directory:

```bash
docker compose up -d
```

This starts:

- **Replane** (built from source) on port 8091
- **PostgreSQL** database
- **Prometheus** on port 9090
- **Grafana** on port 3001

### 2. Run Benchmark

From the repository root:

```bash
pnpm bench
```

Customize test parameters by editing [`.env`](./.env).

### 2b. Run Soak Test (Extended Duration)

Soak testing runs the benchmark suite for an extended period (1 hour by default) to detect:

- Memory leaks
- Resource exhaustion
- Connection pool depletion
- Stability issues under sustained load

```bash
pnpm soak
```

Or customize the duration:

```bash
TEST_DURATION=2h pnpm soak
```

### 3. View Results

- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090

## Configuration

Environment variables (configured in `.env`):

| Variable                     | Default                 | Description                       |
| ---------------------------- | ----------------------- | --------------------------------- |
| `REPLANE_ADMIN_URL`          | `http://localhost:8091` | Admin API URL                     |
| `REPLANE_EDGE_URL`           | `http://localhost:8091` | Edge/SDK API URL                  |
| `REPLANE_SUPERADMIN_API_KEY` | (see .env)              | Superadmin API key                |
| `TEST_DURATION`              | `2m`                    | Test duration                     |
| `RAMP_DOWN_TIME`             | `5s`                    | Ramp down duration                |
| `ADMIN_VUS`                  | `5`                     | Admin API virtual users           |
| `SSE_VUS`                    | `1000`                  | SSE connection virtual users      |
| `PROJECTS_COUNT`             | `100`                   | Number of test projects to create |
| `ADMIN_REQUEST_DELAY_MS`     | `100`                   | Delay between admin requests      |
| `SSE_DURATION_MS`            | `30000`                 | SSE connection duration           |

## Test Scenarios

The benchmark runs three scenarios in parallel:

### Admin API Scenario

- Updates config values across multiple projects
- Simulates admin dashboard activity
- Measures API latency and error rates

### SSE Streaming Scenario

- Opens concurrent SSE connections (SDK clients)
- Receives real-time config updates
- Measures connection establishment and message delivery times

### Metrics Scraping Scenario

Scrapes `/metrics` endpoint every 5 seconds and tracks:

- **CPU**: `process_cpu_user_seconds_total`, `process_cpu_system_seconds_total`, `process_cpu_seconds_total`
- **Memory**: `process_resident_memory_bytes`, `process_virtual_memory_bytes`, `nodejs_heap_size_total_bytes`, `nodejs_heap_size_used_bytes`, `nodejs_external_memory_bytes`
- **Event Loop**: `nodejs_eventloop_lag_seconds`, `nodejs_eventloop_lag_p90_seconds`, `nodejs_eventloop_lag_p99_seconds`
- **Handles**: `nodejs_active_handles_total`
- **Replication**: `replane_replication_streams_active`, `replane_replication_streams_started_total`, `replane_replication_streams_stopped_total`

## Thresholds

Pass/fail thresholds for CI:

| Metric                        | Threshold |
| ----------------------------- | --------- |
| Admin API p95 latency         | < 100ms   |
| Admin API p99 latency         | < 200ms   |
| Admin API success rate        | > 99%     |
| SSE connection success        | > 99%     |
| SSE time to open p95          | < 200ms   |
| SSE time to first message p95 | < 200ms   |
| SSE time to init message p95  | < 200ms   |

## Project Structure

```
bench/
├── scripts/
│   ├── spec.ts           # Main test specification
│   └── lib/
│       ├── admin-client.ts   # Admin API client
│       ├── config.ts         # Test configuration
│       ├── result.ts         # Result type utilities
│       └── utils.ts          # Helper functions
├── dashboards/           # Grafana dashboard JSON
├── grafana/              # Grafana provisioning
├── prometheus/           # Prometheus configuration
├── docker-compose.yml    # Infrastructure stack
├── tsconfig.json         # TypeScript configuration
└── .env                  # Environment variables
```

## Cleanup

```bash
# Stop services
docker compose down

# Remove volumes (database data)
docker compose down -v
```

## CI Integration

The benchmark runs automatically in CI via GitHub Actions. See `.github/workflows/bench.yml`.

### Soak Testing in Releases

Soak tests run automatically before Docker image releases (on version tags). This ensures the release
candidate can handle sustained load for 1 hour without issues.

Soak testing reuses the benchmark workflow with extended duration parameters.

### Running Manually

```bash
# Benchmark (quick, ~2 minutes)
pnpm bench

# Soak test (extended, ~1 hour)
pnpm soak
```
