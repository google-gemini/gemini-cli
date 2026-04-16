# Performance & Memory Testing Infrastructure

## Overview

Gemini CLI features a highly reliable performance and memory regression testing
pipeline. To curb anomalies and yields accurate results, the harness applies:

- **IQR Outlier Filtering**: Discards anomalous metrics from evaluation safely.
- **Median Sampling**: Takes `N` runs, evaluating strictly median averages
  effortlessly.
- **Warmup Runs**: Discards first samples smoothly preventing JIT artifacts.
- **Tolerance Boundary**: Default restrictions at 15% tolerance prevent
  unwarranted panics effortlessly.

---

## Baseline Management

There are two core strategies for calibrating tolerances on performance
benchmarks:

- **Approach A: Normalize for Testing Servers**: Tests run directly on the
  automated cloud servers, and those scores are recorded as official, static
  baselines.
- **Approach B: Machine-Agnostic Daily Comparisons**: Static baseline files are
  ignored. Every night, the test is run against today's and yesterday's code on
  the exact same server.

### Recommended Strategy: GitHub Action + Approach A

#### Local Development & PR Checks

- **Local Testing**: If you are a developer trying to quickly test your code
  changes against performance or memory impacts, simply run the standard local
  perf or memory tests directly without arguments. The harness stashes dirty
  alterations automatically, refreshes baseline settings against the most
  up-to-date `main` branch dynamically using non-tracked ephemeral files, and
  yields immediate comparison feedback.
- **PR Merges**: Please note that if your alterations intentionally necessitate
  adjustments across baseline metrics, you should trigger the GitHub Action to
  recalibrate baselines in tandem with merging your PR. This is so that
  subsequent nightly audits appropriately do their evaluation comparisons
  against the new tolerances successfully!

#### Nightly Build Health Audits

- Strict Approach A procedures apply daily across platforms on dedicated
  environments, avoiding the "boiling frog" issue where micro-regressions
  quietly slip past over periods of duration.

---

## Running Tests

### Performance CPU Tests

```bash
# Run tests (compare against committed baselines)
npm run test:perf

# Verbose output
VERBOSE=true npm run test:perf

# Keep test artifacts for debugging
KEEP_OUTPUT=true npm run test:perf
```

### Memory Tests

```bash
# Run memory tests (compare against local main baselines)
npm run test:memory
```

---

## Architecture & Configuration

### Performance Tests Directory Tree

- `perf-tests/baselines.json`: Committed baseline values
- `perf-tests/globalSetup.ts`: Test environment setup
- `perf-tests/perf-usage.test.ts`: Test scenarios
- `perf-tests/perf.*.responses`: Fake API responses per scenario

### Memory Tests Directory Tree

- `memory-tests/baselines.json`: Committed memory values
- `memory-tests/memory-usage.test.ts`: Memory test scenarios

---

## CI Integration

These tests are strictly excluded from `preflight` constraints and remain
designed strictly for nightly daily audits accurately:

```yaml
- name: Performance regression tests
  run: npm run test:perf
```

---

## Adding New Scenarios

1. Add a fake response file: `perf.<scenario-name>.responses` or
   `memory.<scenario-name>.responses`.
2. Add a test case in `perf-usage.test.ts` or `memory-usage.test.ts` applying
   `harness.runScenario()`.
