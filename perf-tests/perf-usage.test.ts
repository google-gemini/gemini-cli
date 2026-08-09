/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import {
  TestRig,
  PerfTestHarness,
  type PerfSnapshot,
} from '@google/gemini-cli-test-utils';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  existsSync,
  readFileSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
} from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINES_PATH = join(__dirname, 'baselines.json');
const UPDATE_BASELINES = process.env['UPDATE_PERF_BASELINES'] === 'true';
const TOLERANCE_PERCENT = 15;

// Use fewer samples locally for faster iteration, more in CI
const SAMPLE_COUNT = process.env['CI'] ? 5 : 3;
const WARMUP_COUNT = 1;

describe('CPU Performance Tests', () => {
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
    // Generate the summary report after all tests
    await harness.generateReport();
  }, 30000);

  it('cold-startup-time: startup completes within baseline', async () => {
    const result = await harness.runScenario('cold-startup-time', async () => {
      const rig = new TestRig();
      try {
        rig.setup('perf-cold-startup', {
          fakeResponsesPath: join(__dirname, 'perf.cold-startup.responses'),
        });

        return await harness.measure('cold-startup', async () => {
          await rig.run({
            args: ['hello'],
            timeout: 120000,
            env: { GEMINI_API_KEY: 'fake-perf-test-key' },
          });
        });
      } finally {
        await rig.cleanup();
      }
    });

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  it('idle-cpu-usage: CPU stays low when idle', async () => {
    const IDLE_OBSERVATION_MS = 5000;

    const result = await harness.runScenario('idle-cpu-usage', async () => {
      const rig = new TestRig();
      try {
        rig.setup('perf-idle-cpu', {
          fakeResponsesPath: join(__dirname, 'perf.idle-cpu.responses'),
        });

        // First, run a prompt to get the CLI into idle state
        await rig.run({
          args: ['hello'],
          timeout: 120000,
          env: { GEMINI_API_KEY: 'fake-perf-test-key' },
        });

        // Now measure CPU during idle period in the test process
        return await harness.measureWithEventLoop('idle-cpu', async () => {
          // Simulate idle period — just wait
          const { setTimeout: sleep } = await import('node:timers/promises');
          await sleep(IDLE_OBSERVATION_MS);
        });
      } finally {
        await rig.cleanup();
      }
    });

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  it('asian-language-conv: verify perf is acceptable ', async () => {
    const result = await harness.runScenario(
      'asian-language-conv',
      async () => {
        const rig = new TestRig();
        try {
          rig.setup('perf-asian-language', {
            fakeResponsesPath: join(__dirname, 'perf.asian-language.responses'),
          });

          return await harness.measure('asian-language', async () => {
            await rig.run({
              args: ['嗨'],
              timeout: 120000,
              env: { GEMINI_API_KEY: 'fake-perf-test-key' },
            });
          });
        } finally {
          await rig.cleanup();
        }
      },
    );

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  it('skill-loading-time: startup with many skills within baseline', async () => {
    const SKILL_COUNT = 20;

    const result = await harness.runScenario('skill-loading-time', async () => {
      const rig = new TestRig();
      try {
        rig.setup('perf-skill-loading', {
          fakeResponsesPath: join(__dirname, 'perf.skill-loading.responses'),
        });

        // Create many skill directories with SKILL.md files
        for (let i = 0; i < SKILL_COUNT; i++) {
          const skillDir = `.gemini/skills/perf-skill-${i}`;
          rig.mkdir(skillDir);
          rig.createFile(
            `${skillDir}/SKILL.md`,
            [
              '---',
              `name: perf-skill-${i}`,
              `description: Performance test skill number ${i}`,
              `activation: manual`,
              '---',
              '',
              `# Performance Test Skill ${i}`,
              '',
              `This is a test skill for measuring skill loading performance.`,
              `It contains some content to simulate real-world skill files.`,
              '',
              `## Usage`,
              '',
              `Use this skill by activating it with @perf-skill-${i}.`,
            ].join('\n'),
          );
        }

        return await harness.measure('skill-loading', async () => {
          await rig.run({
            args: ['hello'],
            timeout: 120000,
            env: { GEMINI_API_KEY: 'fake-perf-test-key' },
          });
        });
      } finally {
        await rig.cleanup();
      }
    });

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  it('high-volume-shell-output: handles large output efficiently', async () => {
    const result = await harness.runScenario(
      'high-volume-shell-output',
      async () => {
        const rig = new TestRig();
        try {
          rig.setup('perf-high-volume-output', {
            fakeResponsesPath: join(__dirname, 'perf.high-volume.responses'),
          });

          const snapshot = await harness.measureWithEventLoop(
            'high-volume-output',
            async () => {
              await rig.run({
                args: ['Generate 1M lines of output'],
                timeout: 120000,
                env: {
                  GEMINI_API_KEY: 'fake-perf-test-key',
                  GEMINI_TELEMETRY_ENABLED: 'true',
                  GEMINI_MEMORY_MONITOR_INTERVAL: '500',
                  GEMINI_EVENT_LOOP_MONITOR_ENABLED: 'true',
                  DEBUG: 'true',
                },
              });
            },
          );

          // Query CLI's own performance metrics from telemetry logs
          await rig.waitForTelemetryReady();

          // Debug: Read and log the telemetry file content
          try {
            const logFilePath = join(rig.homeDir!, 'telemetry.log');
            if (existsSync(logFilePath)) {
              const content = readFileSync(logFilePath, 'utf-8');
              console.log(`  Telemetry Log Content:\n`, content);
            } else {
              console.log(`  Telemetry log file not found at: ${logFilePath}`);
            }
          } catch (e) {
            console.error(`  Failed to read telemetry log:`, e);
          }

          const memoryMetric = rig.readMetric('memory.usage');
          const cpuMetric = rig.readMetric('cpu.usage');
          const toolLatencyMetric = rig.readMetric('tool.call.latency');
          const eventLoopMetric = rig.readMetric('event_loop.delay');

          if (memoryMetric) {
            console.log(
              `  CLI Memory Metric found:`,
              JSON.stringify(memoryMetric),
            );
          }
          if (cpuMetric) {
            console.log(`  CLI CPU Metric found:`, JSON.stringify(cpuMetric));
          }
          if (toolLatencyMetric) {
            console.log(
              `  CLI Tool Latency Metric found:`,
              JSON.stringify(toolLatencyMetric),
            );
          }
          const logs = rig.readTelemetryLogs();
          console.log(`  Total telemetry log entries: ${logs.length}`);
          for (const logData of logs) {
            if (logData.scopeMetrics) {
              for (const scopeMetric of logData.scopeMetrics) {
                for (const metric of scopeMetric.metrics) {
                  if (metric.descriptor.name.includes('event_loop')) {
                    console.log(
                      `  Found event_loop metric in log:`,
                      metric.descriptor.name,
                    );
                  }
                }
              }
            }
          }

          if (eventLoopMetric) {
            console.log(
              `  CLI Event Loop Metric found:`,
              JSON.stringify(eventLoopMetric),
            );

            const findValue = (percentile: string) => {
              const dp = eventLoopMetric.dataPoints.find(
                (p) => p.attributes?.['percentile'] === percentile,
              );
              return dp?.value?.min;
            };

            snapshot.childEventLoopDelayP50Ms = findValue('p50');
            snapshot.childEventLoopDelayP95Ms = findValue('p95');
            snapshot.childEventLoopDelayMaxMs = findValue('max');
          }

          return snapshot;
        } finally {
          await rig.cleanup();
        }
      },
    );

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  describe('long-conversation', () => {
    let rig: TestRig;
    const identifier = 'perf-long-conversation';
    const SESSION_ID =
      'anonymous_unique_id_577296e0eee5afecdcec05d11838e0cd1a851cd97a28119a4a876b11';
    const LARGE_CHAT_SOURCE = join(
      __dirname,
      '..',
      'memory-tests',
      'large-chat-session.json',
    );

    beforeAll(async () => {
      if (!existsSync(LARGE_CHAT_SOURCE)) {
        throw new Error(
          `Performance test fixture missing: ${LARGE_CHAT_SOURCE}.`,
        );
      }

      rig = new TestRig();
      rig.setup(identifier, {
        fakeResponsesPath: join(__dirname, 'perf.long-chat.responses'),
      });

      const geminiDir = join(rig.homeDir!, '.gemini');
      const projectTempDir = join(geminiDir, 'tmp', identifier);
      const targetChatsDir = join(projectTempDir, 'chats');

      mkdirSync(targetChatsDir, { recursive: true });
      writeFileSync(
        join(geminiDir, 'projects.json'),
        JSON.stringify({
          projects: { [rig.testDir!]: identifier },
        }),
      );
      writeFileSync(join(projectTempDir, '.project_root'), rig.testDir!);
      copyFileSync(
        LARGE_CHAT_SOURCE,
        join(targetChatsDir, `session-${SESSION_ID}.json`),
      );
    });

    afterAll(async () => {
      await rig.cleanup();
    });

    it('session-load: resume a 60MB chat history', async () => {
      const result = await harness.runScenario(
        'long-conversation-resume',
        async () => {
          const snapshot = await harness.measureWithEventLoop(
            'resume',
            async () => {
              const run = await rig.runInteractive({
                args: ['--resume', 'latest'],
                env: {
                  GEMINI_API_KEY: 'fake-perf-test-key',
                  GEMINI_TELEMETRY_ENABLED: 'true',
                  GEMINI_MEMORY_MONITOR_INTERVAL: '500',
                  GEMINI_EVENT_LOOP_MONITOR_ENABLED: 'true',
                  DEBUG: 'true',
                },
              });
              await run.kill();
            },
          );
          return snapshot;
        },
      );

      if (UPDATE_BASELINES) {
        harness.updateScenarioBaseline(result);
      } else {
        harness.assertWithinBaseline(result);
      }
    });

    it('typing: latency when typing into a large session', async () => {
      const result = await harness.runScenario(
        'long-conversation-typing',
        async () => {
          const run = await rig.runInteractive({
            args: ['--resume', 'latest'],
            env: {
              GEMINI_API_KEY: 'fake-perf-test-key',
              GEMINI_TELEMETRY_ENABLED: 'true',
              GEMINI_MEMORY_MONITOR_INTERVAL: '500',
              GEMINI_EVENT_LOOP_MONITOR_ENABLED: 'true',
              DEBUG: 'true',
            },
          });

          const snapshot = await harness.measureWithEventLoop(
            'typing',
            async () => {
              // On average, the expected latency per key is under 30ms.
              for (const char of 'Hello') {
                await run.type(char);
              }
            },
          );

          await run.kill();
          return snapshot;
        },
      );

      if (UPDATE_BASELINES) {
        harness.updateScenarioBaseline(result);
      } else {
        harness.assertWithinBaseline(result);
      }
    });

    it('execution: response latency for a simple shell command', async () => {
      const result = await harness.runScenario(
        'long-conversation-execution',
        async () => {
          const run = await rig.runInteractive({
            args: ['--resume', 'latest'],
            env: {
              GEMINI_API_KEY: 'fake-perf-test-key',
              GEMINI_TELEMETRY_ENABLED: 'true',
              GEMINI_MEMORY_MONITOR_INTERVAL: '500',
              GEMINI_EVENT_LOOP_MONITOR_ENABLED: 'true',
              DEBUG: 'true',
            },
          });

          await run.expectText('Type your message');

          const snapshot = await harness.measureWithEventLoop(
            'execution',
            async () => {
              await run.sendKeys('!echo hi\r');
              await run.expectText('hi');
            },
          );

          await run.kill();
          return snapshot;
        },
      );

      if (UPDATE_BASELINES) {
        harness.updateScenarioBaseline(result);
      } else {
        harness.assertWithinBaseline(result);
      }
    });

    it('terminal-scrolling: latency when scrolling a large terminal buffer', async () => {
      const result = await harness.runScenario(
        'long-conversation-terminal-scrolling',
        async () => {
          // Enable terminalBuffer to intentionally test CLI scrolling logic
          const settingsPath = join(rig.homeDir!, '.gemini', 'settings.json');
          writeFileSync(
            settingsPath,
            JSON.stringify({
              security: { folderTrust: { enabled: false } },
              ui: { terminalBuffer: true },
            }),
          );

          const run = await rig.runInteractive({
            args: ['--resume', 'latest'],
            env: {
              GEMINI_API_KEY: 'fake-perf-test-key',
              GEMINI_TELEMETRY_ENABLED: 'true',
              GEMINI_MEMORY_MONITOR_INTERVAL: '500',
              GEMINI_EVENT_LOOP_MONITOR_ENABLED: 'true',
              DEBUG: 'true',
            },
          });

          await run.expectText('Type your message');

          for (let i = 0; i < 5; i++) {
            await run.sendKeys('\u001b[5~'); // PageUp
          }

          // Scroll to the very top
          await run.sendKeys('\u001b[H'); // Home
          // Verify top line of chat is visible.
          await run.expectText('Authenticated with');

          for (let i = 0; i < 5; i++) {
            await run.sendKeys('\u001b[6~'); // PageDown
          }

          await rig.waitForTelemetryReady();
          await run.kill();

          const eventLoopMetric = rig.readMetric('event_loop.delay');
          const cpuMetric = rig.readMetric('cpu.usage');

          let p50Ms = 0;
          let p95Ms = 0;
          let maxMs = 0;
          if (eventLoopMetric) {
            const dataPoints = eventLoopMetric.dataPoints;
            const p50Data = dataPoints.find(
              (dp) => dp.attributes?.['percentile'] === 'p50',
            );
            const p95Data = dataPoints.find(
              (dp) => dp.attributes?.['percentile'] === 'p95',
            );
            const maxData = dataPoints.find(
              (dp) => dp.attributes?.['percentile'] === 'max',
            );

            if (p50Data?.value?.sum) p50Ms = p50Data.value.sum;
            if (p95Data?.value?.sum) p95Ms = p95Data.value.sum;
            if (maxData?.value?.sum) maxMs = maxData.value.sum;
          }

          let cpuTotalUs = 0;
          if (cpuMetric) {
            const dataPoints = cpuMetric.dataPoints;
            for (const dp of dataPoints) {
              if (dp.value?.sum && dp.value.sum > 0) {
                cpuTotalUs += dp.value.sum;
              }
            }
          }
          const cpuUserUs = cpuTotalUs;
          const cpuSystemUs = 0;

          const snapshot: PerfSnapshot = {
            timestamp: Date.now(),
            label: 'scrolling',
            wallClockMs: Math.round(p50Ms * 10) / 10,
            cpuTotalUs,
            cpuUserUs,
            cpuSystemUs,
            eventLoopDelayP50Ms: p50Ms,
            eventLoopDelayP95Ms: p95Ms,
            eventLoopDelayMaxMs: maxMs,
          };

          return snapshot;
        },
      );

      if (UPDATE_BASELINES) {
        harness.updateScenarioBaseline(result);
      } else {
        harness.assertWithinBaseline(result);
      }
    });

    it('alternate-scrolling: latency when scrolling a large alternate buffer', async () => {
      const result = await harness.runScenario(
        'long-conversation-alternate-scrolling',
        async () => {
          // Enable useAlternateBuffer to intentionally test CLI scrolling logic
          const settingsPath = join(rig.homeDir!, '.gemini', 'settings.json');
          writeFileSync(
            settingsPath,
            JSON.stringify({
              security: { folderTrust: { enabled: false } },
              ui: { useAlternateBuffer: true },
            }),
          );

          const run = await rig.runInteractive({
            args: ['--resume', 'latest'],
            env: {
              GEMINI_API_KEY: 'fake-perf-test-key',
              GEMINI_TELEMETRY_ENABLED: 'true',
              GEMINI_MEMORY_MONITOR_INTERVAL: '500',
              GEMINI_EVENT_LOOP_MONITOR_ENABLED: 'true',
              DEBUG: 'true',
            },
          });

          await run.expectText('Type your message');

          for (let i = 0; i < 5; i++) {
            await run.sendKeys('\u001b[5~'); // PageUp
          }

          // Scroll to the very top
          await run.sendKeys('\u001b[H'); // Home
          // Verify top line of chat is visible.
          await run.expectText('Authenticated with');

          for (let i = 0; i < 5; i++) {
            await run.sendKeys('\u001b[6~'); // PageDown
          }

          await rig.waitForTelemetryReady();
          await run.kill();

          const eventLoopMetric = rig.readMetric('event_loop.delay');
          const cpuMetric = rig.readMetric('cpu.usage');

          let p50Ms = 0;
          let p95Ms = 0;
          let maxMs = 0;
          if (eventLoopMetric) {
            const dataPoints = eventLoopMetric.dataPoints;
            const p50Data = dataPoints.find(
              (dp) => dp.attributes?.['percentile'] === 'p50',
            );
            const p95Data = dataPoints.find(
              (dp) => dp.attributes?.['percentile'] === 'p95',
            );
            const maxData = dataPoints.find(
              (dp) => dp.attributes?.['percentile'] === 'max',
            );

            if (p50Data?.value?.sum) p50Ms = p50Data.value.sum;
            if (p95Data?.value?.sum) p95Ms = p95Data.value.sum;
            if (maxData?.value?.sum) maxMs = maxData.value.sum;
          }

          let cpuTotalUs = 0;
          if (cpuMetric) {
            const dataPoints = cpuMetric.dataPoints;
            for (const dp of dataPoints) {
              if (dp.value?.sum && dp.value.sum > 0) {
                cpuTotalUs += dp.value.sum;
              }
            }
          }
          const cpuUserUs = cpuTotalUs;
          const cpuSystemUs = 0;

          const snapshot: PerfSnapshot = {
            timestamp: Date.now(),
            label: 'scrolling',
            wallClockMs: Math.round(p50Ms * 10) / 10,
            cpuTotalUs,
            cpuUserUs,
            cpuSystemUs,
            eventLoopDelayP50Ms: p50Ms,
            eventLoopDelayP95Ms: p95Ms,
            eventLoopDelayMaxMs: maxMs,
          };

          return snapshot;
        },
      );

      if (UPDATE_BASELINES) {
        harness.updateScenarioBaseline(result);
      } else {
        harness.assertWithinBaseline(result);
      }
    });
  });
});
