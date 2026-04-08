/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import { TestRig, PerfTestHarness } from '@google/gemini-cli-test-utils';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  });

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
});
