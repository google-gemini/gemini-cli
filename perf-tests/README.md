# CPU Performance Integration Test Harness

## Overview

This directory contains performance/CPU integration tests for the Gemini CLI.
These tests measure wall-clock time, CPU usage, and event loop responsiveness to
detect regressions across key scenarios.

CPU performance is inherently noisy, especially in CI. The harness addresses
this with:

- **IQR outlier filtering** — discards anomalous samples
- **Median sampling** — takes N runs, reports the median after filtering
- **Warmup runs** — discards the first run to mitigate JIT compilation noise
- **15% default tolerance** — won't panic at slight regressions

## Running

```bash
# Run tests (compare against committed baselines)
npm run test:perf

# Update baselines (after intentional changes)
npm run test:perf:update-baselines

# Verbose output
VERBOSE=true npm run test:perf

# Keep test artifacts for debugging
KEEP_OUTPUT=true npm run test:perf
```

## How It Works

### Measurement Primitives

The `PerfTestHarness` class (in `packages/test-utils`) provides:

- **`performance.now()`** — high-resolution wall-clock timing
- **`process.cpuUsage()`** — user + system CPU microseconds (delta between
  start/stop)
- **`perf_hooks.monitorEventLoopDelay()`** — event loop delay histogram
  (p50/p95/p99/max)

### Noise Reduction

1. **Warmup**: First run is discarded to mitigate JIT compilation artifacts
2. **Multiple samples**: Each scenario runs N times (default 5)
3. **IQR filtering**: Samples outside Q1−1.5×IQR and Q3+1.5×IQR are discarded
4. **Median**: The median of remaining samples is used for comparison

### Baseline Management

Baselines are stored in `baselines.json` in this directory. Each scenario has:

```json
{
  "cold-startup-time": {
    "wallClockMs": 1234.5,
    "cpuTotalUs": 567890,
    "eventLoopDelayP99Ms": 12.3,
    "timestamp": "2026-04-08T..."
  }
}
```

Tests fail if the measured value exceeds `baseline × 1.15` (15% tolerance).

To recalibrate after intentional changes:

```bash
npm run test:perf:update-baselines
# then commit baselines.json
```

### Report Output

After all tests, the harness prints an ASCII summary:

```
═══════════════════════════════════════════════════
         PERFORMANCE TEST REPORT
═══════════════════════════════════════════════════

cold-startup-time:   1234.5 ms (Baseline: 1200.0 ms, Delta: +2.9%) ✅
idle-cpu-usage:         2.1 %  (Baseline: 2.0 %, Delta: +5.0%)     ✅
skill-loading-time:  1567.8 ms (Baseline: 1500.0 ms, Delta: +4.5%) ✅
```

## Architecture

```
perf-tests/
├── README.md              ← you are here
├── baselines.json         ← committed baseline values
├── globalSetup.ts         ← test environment setup
├── perf-usage.test.ts     ← test scenarios
├── perf.*.responses       ← fake API responses per scenario
├── tsconfig.json          ← TypeScript config
└── vitest.config.ts       ← vitest config (serial, isolated)

packages/test-utils/src/
├── perf-test-harness.ts   ← PerfTestHarness class
└── index.ts               ← re-exports
```

## CI Integration

These tests are **excluded from `preflight`** and designed for nightly CI:

```yaml
- name: Performance regression tests
  run: npm run test:perf
```

## Adding a New Scenario

1. Add a fake response file: `perf.<scenario-name>.responses`
2. Add a test case in `perf-usage.test.ts` using `harness.runScenario()`
3. Run `npm run test:perf:update-baselines` to establish initial baseline
4. Commit the updated `baselines.json`
