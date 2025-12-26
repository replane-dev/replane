# Replane k6 Load Testing

Load testing suite for Replane using [k6](https://k6.io/) with [xk6-sse](https://github.com/phymbert/xk6-sse) extension.

## Features

- **Admin API Tests** - CRUD operations on configs
- **SSE Streaming Tests** - SDK streaming connections
- **Combined Tests** - Both scenarios running in parallel
- **k6 Web Dashboard** - Real-time test visualization
- **Prometheus Metrics** - Real-time metrics export
- **Grafana Dashboards** - Pre-configured visualization

## Quick Start

### 1. Start Infrastructure

```bash
# Start Replane + Prometheus + Grafana
docker compose up -d prometheus grafana replane

# Wait for services to be ready
docker compose ps
```

### 2. Setup Test Data

```bash
# Create test project and SDK key
./scripts/setup.sh

# Or with docker
docker compose run --rm \
  -v $(pwd)/scripts:/scripts \
  --entrypoint /bin/sh \
  k6 -c "apk add --no-cache curl jq && /scripts/setup.sh"
```

### 3. Run Tests

```bash
# Admin API test only
docker compose run --rm --service-ports k6 run \
  --out experimental-prometheus-rw \
  /scripts/admin-api.js

# SSE streaming test only (requires xk6-sse)
docker compose run --rm --service-ports k6 run \
  --out experimental-prometheus-rw \
  /scripts/sse-stream.js

# Combined test (Admin + SSE in parallel)
docker compose run --rm --service-ports k6 run \
  --out experimental-prometheus-rw \
  /scripts/combined.js
```

### 4. View Results

- **k6 Web Dashboard**: http://localhost:5665 (available during test runs)

- **Grafana Dashboard**: http://localhost:3001
  - Username: `admin`
  - Password: `admin`
  - Dashboard: "Replane k6 Load Test"

- **Prometheus**: http://localhost:9090

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REPLANE_ADMIN_URL` | `http://localhost:8080` | Admin API URL |
| `REPLANE_EDGE_URL` | `http://localhost:8080` | Edge/SDK API URL |
| `REPLANE_API_KEY` | `rp_admin_dev_key` | Admin API key |
| `REPLANE_SDK_KEY` | (required) | SDK key for SSE tests |
| `REPLANE_PROJECT_ID` | (auto-created) | Project ID |
| `TEST_DURATION` | `2m` | Test duration |
| `RAMP_UP_TIME` | `30s` | Ramp up duration |
| `RAMP_DOWN_TIME` | `30s` | Ramp down duration |
| `ADMIN_VUS` | `10` | Admin API virtual users |
| `SSE_VUS` | `100` | SSE connection virtual users |
| `OP_CREATE_WEIGHT` | `1` | Create operation weight |
| `OP_READ_WEIGHT` | `3` | Read operation weight |
| `OP_UPDATE_WEIGHT` | `2` | Update operation weight |
| `OP_DELETE_WEIGHT` | `0` | Delete operation weight |

### Running with Custom Settings

```bash
# Short test with more VUs
docker compose run --rm --service-ports \
  -e TEST_DURATION=1m \
  -e ADMIN_VUS=50 \
  -e SSE_VUS=500 \
  k6 run --out experimental-prometheus-rw /scripts/combined.js

# Heavy update workload
docker compose run --rm --service-ports \
  -e OP_CREATE_WEIGHT=1 \
  -e OP_READ_WEIGHT=1 \
  -e OP_UPDATE_WEIGHT=8 \
  -e OP_DELETE_WEIGHT=0 \
  k6 run --out experimental-prometheus-rw /scripts/admin-api.js
```

## Test Scenarios

### Admin API (`admin-api.js`)

Tests CRUD operations on the Admin API:
- Creates, reads, updates, and deletes configs
- Weighted operation distribution
- Tracks latency percentiles and error rates

### SSE Streaming (`sse-stream.js`)

Tests SDK streaming connections:
- Opens SSE connections to `/api/sdk/v1/replication/stream`
- Measures time to first message
- Tracks connection success rate
- Simulates connection churn

### Combined (`combined.js`)

Runs both scenarios simultaneously:
- Admin API modifications
- SSE clients receiving updates
- Tests real-world concurrent load

## k6 Cloud

For k6 cloud, use the scripts directly (SSE tests require local k6 with xk6-sse):

```bash
# Admin API only (works in k6 cloud)
k6 cloud scripts/admin-api.js

# Set environment variables for cloud
K6_CLOUD_TOKEN=xxx k6 cloud \
  -e REPLANE_ADMIN_URL=https://your-replane.com \
  -e REPLANE_API_KEY=your_key \
  scripts/admin-api.js
```

Note: SSE tests require the xk6-sse extension which is not available in k6 cloud.

## Building k6 with xk6-sse Locally

```bash
# Build custom k6
docker build -t k6-sse .

# Run with custom build
docker run --rm -v $(pwd)/scripts:/scripts \
  --network host \
  k6-sse run /scripts/sse-stream.js
```

## Thresholds

Default pass/fail thresholds:

| Metric | Threshold |
|--------|-----------|
| Admin API p95 latency | < 500ms |
| Admin API p99 latency | < 1000ms |
| Admin API error rate | < 1% |
| SSE connection success | > 95% |
| SSE time to first message p95 | < 5000ms |

## Cleanup

```bash
# Stop all services
docker compose down

# Remove volumes (data)
docker compose down -v
```
