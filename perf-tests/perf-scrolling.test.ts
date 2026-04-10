/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { TestRig, PerfTestHarness } from '@google/gemini-cli-test-utils';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINES_PATH = join(__dirname, 'baselines.json');
const TOLERANCE_PERCENT = 15;

const SAMPLE_COUNT = 1;
const WARMUP_COUNT = 0;

describe.each([
  { alt: true, term: true },
  { alt: false, term: false },
  { alt: true, term: false },
  { alt: false, term: true },
])('Scrolling Performance Tests (alt=$alt, term=$term)', ({ alt, term }) => {
  let harness: PerfTestHarness;

  beforeAll(() => {
    harness = new PerfTestHarness({
      baselinesPath: BASELINES_PATH,
      defaultTolerancePercent: TOLERANCE_PERCENT,
      sampleCount: SAMPLE_COUNT,
      warmupCount: WARMUP_COUNT,
    });
  });

  afterAll(async () => {
    await harness.generateReport();
  }, 30000);

  async function createRealHistory(rig: TestRig, count: number) {
    const run = await rig.runInteractive({
      args: [],
      env: {
        HOME: rig.homeDir!,
        GEMINI_API_KEY: 'test-api-key',
      },
    });

    await run.expectText('type your message');

    for (let i = 0; i < count; i++) {
      // Send the /compress command directly
      await run.sendText('/compress');
      await new Promise((r) => setTimeout(r, 100));
      // First enter to select from autocomplete
      await run.sendText('\r');
      await new Promise((r) => setTimeout(r, 100));
      // Second enter to execute
      await run.sendText('\r');
      // Wait for the output to confirm execution
      await run.expectText('nothing to compress.');
    }

    // Exit gracefully by sending SIGTERM to ensure telemetry is flushed
    await run.kill();
    await run.expectExit();
  }

  function readMetrics(
    rig: TestRig,
  ): { p50: number; p95: number; max: number }[] {
    const logs = rig.readTelemetryLogs();
    const metrics: { p50: number; p95: number; max: number }[] = [];

    for (const log of logs) {
      if (log.scopeMetrics) {
        for (const sm of log.scopeMetrics) {
          for (const m of sm.metrics) {
            if (m.descriptor.name === 'gemini_cli.event_loop.delay') {
              const p50 = m.dataPoints.find(
                (dp: { attributes: { percentile: string }; value: number }) =>
                  dp.attributes.percentile === 'p50',
              )?.value;
              const p95 = m.dataPoints.find(
                (dp: { attributes: { percentile: string }; value: number }) =>
                  dp.attributes.percentile === 'p95',
              )?.value;
              const max = m.dataPoints.find(
                (dp: { attributes: { percentile: string }; value: number }) =>
                  dp.attributes.percentile === 'max',
              )?.value;

              if (p50 !== undefined || p95 !== undefined || max !== undefined) {
                metrics.push({ p50: p50 ?? 0, p95: p95 ?? 0, max: max ?? 0 });
              }
            }
          }
        }
      }
    }
    return metrics;
  }

  it('straight-scroll-up: scrolling all the way up', async () => {
    await harness.runScenario(
      `straight-scroll-up-alt-${alt}-term-${term}`,
      async () => {
        const rig = new TestRig();
        try {
          rig.setup(`perf-scroll-up-${alt}-${term}`, {
            settings: {
              ui: {
                useAlternateBuffer: alt,
                terminalBuffer: term,
              },
            },
          });

          await createRealHistory(rig, 10);

          const run = await rig.runInteractive({
            args: ['--resume', '1'],
            env: {
              GEMINI_EVENT_LOOP_MONITOR_ENABLED: 'true',
              GEMINI_MEMORY_MONITOR_INTERVAL: '500',
              HOME: rig.homeDir!,
              GEMINI_API_KEY: 'test-api-key',
            },
          });

          await run.expectText('type your message');
          // We expect to see the history text when resuming
          await run.expectText('nothing to compress.', 30000);

          const snapshot = await harness.measure(
            'straight-scroll',
            async () => {
              // Send PageUp 10 times to go to top
              for (let i = 0; i < 10; i++) {
                run.ptyProcess.write('\x1b[5~');
                await new Promise((r) => setImmediate(r));
              }
              await run.expectText('type your message');
            },
          );

          await run.type('/exit');
          await run.sendText('\r');
          await run.sendText('\r');
          await run.expectExit();
          run.ptyProcess.kill();

          const metrics = readMetrics(rig);

          expect(metrics.length).toBeGreaterThan(0);

          if (metrics.length > 0) {
            snapshot.eventLoopDelayP50Ms = Math.max(
              ...metrics.map((m) => m.p50),
            );
            snapshot.eventLoopDelayP95Ms = Math.max(
              ...metrics.map((m) => m.p95),
            );
            snapshot.eventLoopDelayMaxMs = Math.max(
              ...metrics.map((m) => m.max),
            );
          }

          expect(snapshot.eventLoopDelayMaxMs).toBeLessThan(250);

          return snapshot;
        } finally {
          rig.cleanup();
          delete process.env['GEMINI_EVENT_LOOP_MONITOR_ENABLED'];
          delete process.env['GEMINI_MEMORY_MONITOR_INTERVAL'];
        }
      },
    );
  }, 180000);

  it('jitter-scroll: random scroll ups and downs', async () => {
    await harness.runScenario(
      `jitter-scroll-alt-${alt}-term-${term}`,
      async () => {
        const rig = new TestRig();
        try {
          rig.setup(`perf-jitter-scroll-${alt}-${term}`, {
            settings: {
              ui: {
                useAlternateBuffer: alt,
                terminalBuffer: term,
              },
            },
          });

          await createRealHistory(rig, 10);

          const run = await rig.runInteractive({
            args: ['--resume', '1'],
            env: {
              GEMINI_EVENT_LOOP_MONITOR_ENABLED: 'true',
              GEMINI_MEMORY_MONITOR_INTERVAL: '500',
              HOME: rig.homeDir!,
              GEMINI_API_KEY: 'test-api-key',
            },
          });

          await run.expectText('type your message');
          await run.expectText('nothing to compress.', 30000);

          const snapshot = await harness.measure('jitter-scroll', async () => {
            // Simulate jitter: 3 up, 1 down. Do it 10 times to ensure we go all the way up.
            for (let i = 0; i < 10; i++) {
              for (let j = 0; j < 3; j++) {
                run.ptyProcess.write('\x1b[5~'); // PageUp
                await new Promise((r) => setImmediate(r));
              }
              run.ptyProcess.write('\x1b[6~'); // PageDown
              await new Promise((r) => setImmediate(r));
            }
            await run.expectText('type your message');
          });

          await run.type('/exit');
          await run.sendText('\r');
          await run.sendText('\r');
          await run.expectExit();
          run.ptyProcess.kill();

          const metrics = readMetrics(rig);

          expect(metrics.length).toBeGreaterThan(0);

          if (metrics.length > 0) {
            snapshot.eventLoopDelayP50Ms = Math.max(
              ...metrics.map((m) => m.p50),
            );
            snapshot.eventLoopDelayP95Ms = Math.max(
              ...metrics.map((m) => m.p95),
            );
            snapshot.eventLoopDelayMaxMs = Math.max(
              ...metrics.map((m) => m.max),
            );
          }

          expect(snapshot.eventLoopDelayMaxMs).toBeLessThan(250);

          return snapshot;
        } finally {
          rig.cleanup();
          delete process.env['GEMINI_EVENT_LOOP_MONITOR_ENABLED'];
          delete process.env['GEMINI_MEMORY_MONITOR_INTERVAL'];
        }
      },
    );
  }, 180000);
});
