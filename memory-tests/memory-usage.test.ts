/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeAll, afterAll, afterEach } from 'vitest';
import { TestRig, MemoryTestHarness } from '@google/gemini-cli-test-utils';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINES_PATH = join(__dirname, 'baselines.json');
const UPDATE_BASELINES = process.env['UPDATE_MEMORY_BASELINES'] === 'true';
const TOLERANCE_PERCENT = 10;

// Fake API key for tests using fake responses
const TEST_ENV = { GEMINI_API_KEY: 'fake-memory-test-key' };

describe('Memory Usage Tests', () => {
  let harness: MemoryTestHarness;
  let rig: TestRig;

  beforeAll(() => {
    harness = new MemoryTestHarness({
      baselinesPath: BASELINES_PATH,
      defaultTolerancePercent: TOLERANCE_PERCENT,
      gcCycles: 3,
      gcDelayMs: 100,
      sampleCount: 3,
    });
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  afterAll(async () => {
    // Generate the summary report after all tests
    await harness.generateReport();
  });

  it('idle-session-startup: memory usage within baseline', async () => {
    rig = new TestRig();
    rig.setup('memory-idle-startup', {
      fakeResponsesPath: join(__dirname, 'memory.idle-startup.responses'),
    });

    const result = await harness.runScenario(
      'idle-session-startup',
      async (recordSnapshot) => {
        await rig.run({
          args: ['hello'],
          timeout: 120000,
          env: TEST_ENV,
        });

        await recordSnapshot('after-startup');
      },
    );

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
      console.log(
        `Updated baseline for idle-session-startup: ${(result.finalHeapUsed / (1024 * 1024)).toFixed(1)} MB`,
      );
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  it('simple-prompt-response: memory usage within baseline', async () => {
    rig = new TestRig();
    rig.setup('memory-simple-prompt', {
      fakeResponsesPath: join(__dirname, 'memory.simple-prompt.responses'),
    });

    const result = await harness.runScenario(
      'simple-prompt-response',
      async (recordSnapshot) => {
        await rig.run({
          args: ['What is the capital of France?'],
          timeout: 120000,
          env: TEST_ENV,
        });

        await recordSnapshot('after-response');
      },
    );

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
      console.log(
        `Updated baseline for simple-prompt-response: ${(result.finalHeapUsed / (1024 * 1024)).toFixed(1)} MB`,
      );
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  it('multi-turn-conversation: memory remains stable over turns', async () => {
    rig = new TestRig();
    rig.setup('memory-multi-turn', {
      fakeResponsesPath: join(__dirname, 'memory.multi-turn.responses'),
    });

    const prompts = [
      'Hello, what can you help me with?',
      'Tell me about JavaScript',
      'How is TypeScript different?',
      'Can you write a simple TypeScript function?',
      'What are some TypeScript best practices?',
    ];

    const result = await harness.runScenario(
      'multi-turn-conversation',
      async (recordSnapshot) => {
        // Run through all turns as a piped sequence
        const stdinContent = prompts.join('\n');
        await rig.run({
          stdin: stdinContent,
          timeout: 120000,
          env: TEST_ENV,
        });

        // Take snapshots after the conversation completes
        await recordSnapshot('after-all-turns');
      },
    );

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
      console.log(
        `Updated baseline for multi-turn-conversation: ${(result.finalHeapUsed / (1024 * 1024)).toFixed(1)} MB`,
      );
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  it('multi-function-call-repo-search: memory after tool use', async () => {
    rig = new TestRig();
    rig.setup('memory-multi-func-call', {
      fakeResponsesPath: join(
        __dirname,
        'memory.multi-function-call.responses',
      ),
    });

    // Create directories first, then files in the workspace so the tools have targets
    rig.mkdir('packages/core/src/telemetry');
    rig.createFile(
      'packages/core/src/telemetry/memory-monitor.ts',
      'export class MemoryMonitor { constructor() {} }',
    );
    rig.createFile(
      'packages/core/src/telemetry/metrics.ts',
      'export function recordMemoryUsage() {}',
    );

    const result = await harness.runScenario(
      'multi-function-call-repo-search',
      async (recordSnapshot) => {
        await rig.run({
          args: [
            'Search this repository for MemoryMonitor and tell me what it does',
          ],
          timeout: 120000,
          env: TEST_ENV,
        });

        await recordSnapshot('after-tool-calls');
      },
    );

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
      console.log(
        `Updated baseline for multi-function-call-repo-search: ${(result.finalHeapUsed / (1024 * 1024)).toFixed(1)} MB`,
      );
    } else {
      harness.assertWithinBaseline(result);
    }
  });
});
