/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Performance benchmark script for CI regression detection.
 * Measures startup time and fails if it exceeds the threshold.
 *
 * Usage: node scripts/performance-benchmark.js [--threshold-ms=5000]
 */

import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const DEFAULT_THRESHOLD_MS = 5000;
const WARMUP_RUNS = 2;
const MEASUREMENT_RUNS = 5;

interface BenchmarkResult {
  runs: number[];
  average: number;
  min: number;
  max: number;
  p95: number;
}

function parseArgs(): { threshold: number } {
  const args = process.argv.slice(2);
  let threshold = DEFAULT_THRESHOLD_MS;

  for (const arg of args) {
    if (arg.startsWith('--threshold-ms=')) {
      threshold = parseInt(arg.split('=')[1], 10);
    }
  }

  return { threshold };
}

async function measureStartupTime(): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now();

    const child = spawn('node', ['packages/cli/dist/index.js', '--version'], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' },
    });

    child.on('error', reject);

    child.on('close', (code) => {
      const duration = performance.now() - start;
      if (code === 0) {
        resolve(duration);
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

function calculateStats(runs: number[]): BenchmarkResult {
  const sorted = [...runs].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p95Index = Math.floor(sorted.length * 0.95);

  return {
    runs,
    average: sum / sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[Math.min(p95Index, sorted.length - 1)],
  };
}

async function main(): Promise<void> {
  const { threshold } = parseArgs();

  console.log('Performance Benchmark');
  console.log('='.repeat(50));
  console.log(`Threshold: ${threshold}ms`);
  console.log(`Warmup runs: ${WARMUP_RUNS}`);
  console.log(`Measurement runs: ${MEASUREMENT_RUNS}`);
  console.log();

  // Warmup runs (not measured)
  console.log('Running warmup...');
  for (let i = 0; i < WARMUP_RUNS; i++) {
    await measureStartupTime();
    process.stdout.write(`  Warmup ${i + 1}/${WARMUP_RUNS}\r`);
  }
  console.log();

  // Measurement runs
  console.log('Running measurements...');
  const runs: number[] = [];
  for (let i = 0; i < MEASUREMENT_RUNS; i++) {
    const duration = await measureStartupTime();
    runs.push(duration);
    process.stdout.write(
      `  Run ${i + 1}/${MEASUREMENT_RUNS}: ${duration.toFixed(2)}ms\r`,
    );
  }
  console.log();

  const result = calculateStats(runs);

  console.log();
  console.log('Results');
  console.log('-'.repeat(50));
  console.log(`  Average: ${result.average.toFixed(2)}ms`);
  console.log(`  Min:     ${result.min.toFixed(2)}ms`);
  console.log(`  Max:     ${result.max.toFixed(2)}ms`);
  console.log(`  P95:     ${result.p95.toFixed(2)}ms`);
  console.log();

  if (result.average > threshold) {
    console.error(
      `❌ FAILED: Average startup time (${result.average.toFixed(2)}ms) exceeds threshold (${threshold}ms)`,
    );
    process.exit(1);
  } else {
    console.log(
      `✅ PASSED: Average startup time (${result.average.toFixed(2)}ms) is within threshold (${threshold}ms)`,
    );
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
