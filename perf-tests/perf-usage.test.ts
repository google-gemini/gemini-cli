/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import { TestRig, PerfTestHarness } from '@google/gemini-cli-test-utils';
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
              const runResult = await rig.run({
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
              console.log(`  Child Process Output:`, runResult);
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const logs = (rig as any)._readAndParseTelemetryLog();
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (p: any) => p.attributes.percentile === percentile,
              );
              return dp ? dp.value.min : undefined;
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

  it('long-conversation: input, command, and scroll latency', async () => {
    const LARGE_CHAT_SOURCE = join(
      __dirname,
      '..',
      'memory-tests',
      'large-chat-session.json',
    );

    const result = await harness.runScenario('long-conversation', async () => {
      const rig = new TestRig();
      try {
        rig.setup('perf-long-conversation', {
          fakeResponsesPath: join(__dirname, 'perf.long-chat.responses'),
        });

        const SESSION_ID =
          'anonymous_unique_id_577296e0eee5afecdcec05d11838e0cd1a851cd97a28119a4a876b11';
        const identifier = 'perf-long-conversation';

        // Manually setup the project registry so the CLI knows this project's ID
        const geminiDir = join(rig.homeDir!, '.gemini');
        mkdirSync(geminiDir, { recursive: true });
        const registryPath = join(geminiDir, 'projects.json');
        const projects = { [rig.testDir!]: identifier };
        if (process.platform === 'win32') {
          projects[rig.testDir!.toLowerCase()] = identifier;
        }
        writeFileSync(registryPath, JSON.stringify({ projects }));

        // Create the temp dir and ownership marker
        const projectTempDir = join(geminiDir, 'tmp', identifier);
        mkdirSync(projectTempDir, { recursive: true });
        writeFileSync(join(projectTempDir, '.project_root'), rig.testDir!);

        // Setup the large chat history file
        const targetChatsDir = join(projectTempDir, 'chats');
        mkdirSync(targetChatsDir, { recursive: true });
        const sessionFilePath = join(
          targetChatsDir,
          `session-${SESSION_ID}.json`,
        );
        copyFileSync(LARGE_CHAT_SOURCE, sessionFilePath);

        if (process.env['DEBUG']) {
          console.log(`[PERF DEBUG] rig.testDir: ${rig.testDir}`);
          console.log(`[PERF DEBUG] rig.homeDir: ${rig.homeDir}`);
          console.log(`[PERF DEBUG] Registry path: ${registryPath}`);
          console.log(
            `[PERF DEBUG] Registry content: ${readFileSync(registryPath, 'utf8')}`,
          );
          console.log(`[PERF DEBUG] Session file path: ${sessionFilePath}`);
          console.log(
            `[PERF DEBUG] Session file exists: ${existsSync(sessionFilePath)}`,
          );
        }

        let sessionLoadTimeMs = 0;
        let avgTypingLatencyMs = 0;
        let commandExecutionTimeMs = 0;
        let scrollingLatencyMs = 0;

        const snapshot = await harness.measureWithEventLoop(
          'long-conversation-full',
          async () => {
            // 1. Measure Session Load Time
            harness.startTimer('session-load-time');
            const run = await rig.runInteractive({
              args: ['--resume', 'latest', '--debug'],
              env: { GEMINI_API_KEY: 'fake-perf-test-key' },
            });
            const loadSnapshot = harness.stopTimer('session-load-time');
            sessionLoadTimeMs = loadSnapshot.wallClockMs;

            // 2. Measure Typing Latency (average over 10 chars)
            const testString = 'Hello Gemini';
            harness.startTimer('typing-latency');
            await run.type(testString);
            const typeSnapshot = harness.stopTimer('typing-latency');
            avgTypingLatencyMs = typeSnapshot.wallClockMs / testString.length;

            // 3. Measure Simple Command Execution
            harness.startTimer('command-execution-time');
            await run.sendText('\r'); // Submit the "Hello Gemini" prompt
            await run.expectText(
              'I am a large conversation model response.',
              30000,
            );
            const cmdSnapshot = harness.stopTimer('command-execution-time');
            commandExecutionTimeMs = cmdSnapshot.wallClockMs;

            // 4. Measure Scrolling Performance (Up/Down)
            harness.startTimer('scrolling-latency');
            // Simulate PageUp/PageDown multiple times
            for (let i = 0; i < 5; i++) {
              await run.sendKeys('\u001b[5~'); // PageUp
              await run.sendKeys('\u001b[6~'); // PageDown
            }
            const scrollSnapshot = harness.stopTimer('scrolling-latency');
            scrollingLatencyMs = scrollSnapshot.wallClockMs;

            await run.kill();
          },
        );

        // Add the sub-metrics to the main snapshot
        return {
          ...snapshot,
          sessionLoadTimeMs,
          avgTypingLatencyMs,
          commandExecutionTimeMs,
          scrollingLatencyMs,
        };
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
});
