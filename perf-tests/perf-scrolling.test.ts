/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { TestRig, PerfTestHarness } from '@google/gemini-cli-test-utils';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';

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

  function createFakeHistory(rig: TestRig, count: number) {
    const testDir = rig.testDir!;
    const chatsDir = join(testDir, '.gemini', 'tmp', 'chats');
    mkdirSync(chatsDir, { recursive: true });

    const sessionFile = join(chatsDir, 'session-2026-04-10T00-00-test.jsonl');

    const metadata = {
      sessionId: 'test-session-id',
      projectHash: 'test-project-hash',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      kind: 'main',
    };

    let content = JSON.stringify(metadata) + '\n';

    for (let i = 0; i < count; i++) {
      const msg = {
        id: `msg-${i}`,
        timestamp: new Date().toISOString(),
        type: i % 2 === 0 ? 'user' : 'gemini',
        content: `Message content ${i} `.repeat(10),
      };
      content += JSON.stringify(msg) + '\n';
    }

    writeFileSync(sessionFile, content);
    return sessionFile;
  }

  function readMetrics(
    rig: TestRig,
  ): { p50: number; p95: number; max: number }[] {
    const logFilePath = join(rig.homeDir!, 'telemetry.log');
    if (!existsSync(logFilePath)) return [];

    const content = readFileSync(logFilePath, 'utf-8');
    const jsonObjects = content
      .split(/}\n{/)
      .map((obj, index, array) => {
        if (index > 0) obj = '{' + obj;
        if (index < array.length - 1) obj = obj + '}';
        return obj.trim();
      })
      .filter((obj) => obj);

    const metrics: { p50: number; p95: number; max: number }[] = [];

    for (const jsonStr of jsonObjects) {
      try {
        const log = JSON.parse(jsonStr);
        if (log.scopeMetrics) {
          for (const sm of log.scopeMetrics) {
            for (const m of sm.metrics) {
              if (m.descriptor.name === 'gemini_cli.event_loop.delay') {
                // Extract values based on attributes
                // event-loop-monitor.ts emits p50, p95, max
                // They might be in different data points
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

                if (
                  p50 !== undefined ||
                  p95 !== undefined ||
                  max !== undefined
                ) {
                  metrics.push({ p50: p50 ?? 0, p95: p95 ?? 0, max: max ?? 0 });
                }
              }
            }
          }
        }
      } catch {
        // ignore parse errors
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

          createFakeHistory(rig, 1000);

          const run = await rig.runInteractive({
            env: {
              GEMINI_EVENT_LOOP_MONITOR_ENABLED: 'true',
              GEMINI_MEMORY_MONITOR_INTERVAL: '500',
            },
          });

          // Wait for prompt or some text indicating readiness
          await new Promise((r) => setTimeout(r, 3000)); // Wait for history to load

          const snapshot = await harness.measure(
            'straight-scroll',
            async () => {
              // Send PageUp 50 times
              for (let i = 0; i < 50; i++) {
                run.ptyProcess.write('\x1b[5~');
                await new Promise((r) => setTimeout(r, 50));
              }
              // Wait for rendering to settle
              await new Promise((r) => setTimeout(r, 1000));
            },
          );

          run.ptyProcess.write('exit\n');
          await new Promise((r) => setTimeout(r, 3000));
          run.ptyProcess.kill();

          const metrics = readMetrics(rig);
          console.log('Event Loop Metrics (Straight Scroll):', metrics);

          expect(metrics.length).toBeGreaterThan(0);

          if (metrics.length > 0) {
            snapshot.eventLoopDelayP50Ms = Math.max(
              ...metrics.map((m) => m.p50.max),
            );
            snapshot.eventLoopDelayP95Ms = Math.max(
              ...metrics.map((m) => m.p95.max),
            );
            snapshot.eventLoopDelayMaxMs = Math.max(
              ...metrics.map((m) => m.max.max),
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

          createFakeHistory(rig, 1000);

          const run = await rig.runInteractive({
            env: {
              GEMINI_EVENT_LOOP_MONITOR_ENABLED: 'true',
              GEMINI_MEMORY_MONITOR_INTERVAL: '500',
            },
          });

          await new Promise((r) => setTimeout(r, 3000));

          const snapshot = await harness.measure('jitter-scroll', async () => {
            // Simulate jitter: 3 up, 1 down
            for (let i = 0; i < 20; i++) {
              for (let j = 0; j < 3; j++) {
                run.ptyProcess.write('\x1b[5~'); // PageUp
                await new Promise((r) => setTimeout(r, 50));
              }
              run.ptyProcess.write('\x1b[6~'); // PageDown
              await new Promise((r) => setTimeout(r, 50));
            }
            await new Promise((r) => setTimeout(r, 1000));
          });

          run.ptyProcess.write('exit\n');
          await new Promise((r) => setTimeout(r, 3000));
          run.ptyProcess.kill();

          const metrics = readMetrics(rig);
          console.log('Event Loop Metrics (Jitter Scroll):', metrics);

          expect(metrics.length).toBeGreaterThan(0);

          if (metrics.length > 0) {
            snapshot.eventLoopDelayP50Ms = Math.max(
              ...metrics.map((m) => m.p50.max),
            );
            snapshot.eventLoopDelayP95Ms = Math.max(
              ...metrics.map((m) => m.p95.max),
            );
            snapshot.eventLoopDelayMaxMs = Math.max(
              ...metrics.map((m) => m.max.max),
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
