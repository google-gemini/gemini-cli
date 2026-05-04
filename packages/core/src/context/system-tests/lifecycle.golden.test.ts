/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { SimulationHarness } from './simulationHarness.js';
import { createMockLlmClient } from '../testing/contextTestUtils.js';
import type { ContextProfile } from '../config/profiles.js';
import { createToolMaskingProcessor } from '../processors/toolMaskingProcessor.js';
import { createBlobDegradationProcessor } from '../processors/blobDegradationProcessor.js';
import { createStateSnapshotProcessor } from '../processors/stateSnapshotProcessor.js';
import { createHistoryTruncationProcessor } from '../processors/historyTruncationProcessor.js';
import { createStateSnapshotAsyncProcessor } from '../processors/stateSnapshotAsyncProcessor.js';

expect.addSnapshotSerializer({
  test: (val) =>
    typeof val === 'string' &&
    (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      val,
    ) ||
      /[\\/]tmp[\\/]sim/.test(val)),
  print: (val) => {
    if (typeof val !== 'string') return `"${val}"`;
    let scrubbed = val
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '<UUID>',
      )
      .replace(/[\\/]tmp[\\/]sim[^\s"'\]]*/g, '<MOCKED_DIR>');

    // Also scrub timestamps in filenames like blob_1234567890_...
    scrubbed = scrubbed.replace(/blob_\d+_/g, 'blob_<TIMESTAMP>_');

    return `"${scrubbed}"`;
  },
});

describe('System Lifecycle Golden Tests', () => {
  afterAll(async () => {
    fs.rmSync('/tmp/sim', { recursive: true, force: true });
    fs.rmSync('mock', { recursive: true, force: true });
  });

  beforeAll(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  const getAggressiveConfig = (): ContextProfile => ({
    name: 'Aggressive Test',
    config: {
      budget: { maxTokens: 1000, retainedTokens: 500 }, // Extremely tight limits
    },
    buildPipelines: (env) => [
      {
        name: 'Pressure Relief', // Emits from eventBus 'retained_exceeded'
        triggers: ['retained_exceeded'],
        processors: [
          createBlobDegradationProcessor('BlobDegradationProcessor', env),
          createToolMaskingProcessor('ToolMaskingProcessor', env, {
            stringLengthThresholdTokens: 50,
          }),
          createStateSnapshotProcessor('StateSnapshotProcessor', env, {}),
        ],
      },
      {
        name: 'Immediate Sanitization', // The magic string the projector is hardcoded to use
        triggers: ['retained_exceeded'],
        processors: [
          createHistoryTruncationProcessor(
            'HistoryTruncationProcessor',
            env,
            {},
          ),
        ],
      },
    ],
    buildAsyncPipelines: (env) => [
      {
        name: 'Async',
        triggers: ['nodes_aged_out'],
        processors: [
          createStateSnapshotAsyncProcessor(
            'StateSnapshotAsyncProcessor',
            env,
            {},
          ),
        ],
      },
    ],
  });

  const mockLlmClient = createMockLlmClient([
    '<MOCKED_STATE_SNAPSHOT_SUMMARY>',
  ]);

  it('Scenario 1: Organic Growth with Huge Tool Output & Images', async () => {
    const harness = await SimulationHarness.create(
      getAggressiveConfig(),
      mockLlmClient,
    );

    // Turn 0: System Prompt
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'System Instructions' }] },
      { role: 'model', parts: [{ text: 'Ack.' }] },
    ]);

    // Turn 1: Normal conversation
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'Hello!' }] },
      { role: 'model', parts: [{ text: 'Hi, how can I help?' }] },
    ]);

    // Turn 2: Massive Tool Output (Should trigger ToolMaskingProcessor in background)
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'Read the logs.' }] },
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'run_shell_command',
              args: { cmd: 'cat server.log' },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'run_shell_command',
              response: { output: 'LOG '.repeat(5000) },
            },
          },
        ],
      },
      { role: 'model', parts: [{ text: 'The logs are very long.' }] },
    ]);

    // Turn 3: Multi-modal blob (Should trigger BlobDegradationProcessor)
    await harness.simulateTurn([
      {
        role: 'user',
        parts: [
          { text: 'Look at this architecture diagram:' },
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'fake_base64_data_'.repeat(1000),
            },
          },
        ],
      },
      { role: 'model', parts: [{ text: 'Nice diagram.' }] },
    ]);

    // Turn 4: More conversation to trigger StateSnapshot
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'Can we refactor?' }] },
      { role: 'model', parts: [{ text: 'Yes we can.' }] },
    ]);

    // Get final state
    const goldenState = await harness.getGoldenState();

    // In a perfectly functioning opportunistic system, the token trajectory should show
    // the massive spikes in Turn 2 and 3 being immediately resolved by the background tasks.
    // The final projection should fit neatly under the Max Tokens limit.

    expect(goldenState).toMatchSnapshot();
  });

  it('Scenario 2: Under Budget (No Modifications)', async () => {
    const generousConfig: ContextProfile = {
      name: 'Generous Config',
      config: {
        budget: { maxTokens: 100000, retainedTokens: 50000 },
      },
      buildPipelines: () => [],
      buildAsyncPipelines: () => [],
    };

    const harness = await SimulationHarness.create(
      generousConfig,
      mockLlmClient,
    );

    // Turn 0: System Prompt
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'System Instructions' }] },
      { role: 'model', parts: [{ text: 'Ack.' }] },
    ]);

    // Turn 1: Normal conversation
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'Hello!' }] },
      { role: 'model', parts: [{ text: 'Hi, how can I help?' }] },
    ]);

    const goldenState = await harness.getGoldenState();

    // Total tokens should cleanly match character count with no synthetic nodes
    expect(goldenState).toMatchSnapshot();
  });

  it('Scenario 3: Async-Driven Background GC', async () => {
    const gcConfig: ContextProfile = {
      name: 'GC Test Config',
      config: {
        budget: { maxTokens: 200, retainedTokens: 100 },
      },
      buildPipelines: () => [],
      buildAsyncPipelines: (env) => [
        {
          name: 'Async',
          triggers: ['nodes_aged_out'],
          processors: [
            createStateSnapshotAsyncProcessor(
              'StateSnapshotAsyncProcessor',
              env,
              {},
            ),
          ],
        },
      ],
    };

    const harness = await SimulationHarness.create(gcConfig, mockLlmClient);

    // Turn 0
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'A'.repeat(50) }] },
      { role: 'model', parts: [{ text: 'B'.repeat(50) }] },
    ]);

    // Turn 1 (Should trigger StateSnapshotasync pipeline because we exceed 100 retainedTokens)
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'C'.repeat(50) }] },
      { role: 'model', parts: [{ text: 'D'.repeat(50) }] },
    ]);

    // Give the async background pipeline an extra beat to complete its async execution and emit variants
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Turn 2
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'E'.repeat(50) }] },
      { role: 'model', parts: [{ text: 'F'.repeat(50) }] },
    ]);

    const goldenState = await harness.getGoldenState();

    // We should see ROLLING_SUMMARY nodes injected into the graph, proving the async pipeline ran in the background
    expect(goldenState).toMatchSnapshot();
  });
});
