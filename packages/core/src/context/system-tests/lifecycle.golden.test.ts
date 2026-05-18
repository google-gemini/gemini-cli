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
import { stressTestProfile } from '../config/profiles.js';

expect.addSnapshotSerializer({
  test: (val) =>
    typeof val === 'string' &&
    (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      val,
    ) ||
      /^[0-9a-f]{32}$/i.test(val) ||
      /[\\/]tmp[\\/]sim/.test(val)),
  print: (val) => {
    if (typeof val !== 'string') return `"${val}"`;
    let scrubbed = val
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '<UUID>',
      )
      .replace(/\b[0-9a-f]{32}\b/gi, '<UUID>')
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

  // Uses dynamic role-based mocking to differentiate Snapshot vs Distillation output automatically.
  const mockLlmClient = createMockLlmClient();

  it('Scenario 1: Organic Growth with Huge Tool Output & Images', async () => {
    // Override stressTestProfile limits slightly to ensure immediate overflow
    // without having to push 50,000 characters to cross the generalist boundaries.
    const customProfile: ContextProfile = {
      ...stressTestProfile,
      config: {
        ...stressTestProfile.config,
        budget: { maxTokens: 1000, retainedTokens: 500 },
      },
    };

    const harness = await SimulationHarness.create(
      customProfile,
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

    // Give the background tasks a moment to inject the snapshot into the graph
    await new Promise((resolve) => setTimeout(resolve, 50));

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

  it('Scenario 3: Node Distillation of Large Historical Messages', async () => {
    // 1 Turn = ~2520 tokens.
    // retainedTokens = 4000 ensures Turn 0 is kept intact until Turn 1 pushes the total to ~5040.
    const customProfile: ContextProfile = {
      ...stressTestProfile,
      config: {
        ...stressTestProfile.config,
        budget: { maxTokens: 10000, retainedTokens: 4000 },
        processorOptions: {
          ...stressTestProfile.config?.processorOptions,
          NodeDistillation: {
            type: 'NodeDistillationProcessor',
            options: {
              nodeThresholdTokens: 1000, // 1250 > 1000, so older messages will be distilled
            },
          },
        },
      },
      // Disable async pipelines (StateSnapshots) so they don't compete with the Normalization pipeline
      buildAsyncPipelines: () => [],
    };

    const harness = await SimulationHarness.create(
      customProfile,
      mockLlmClient,
    );

    // Turn 0
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'A'.repeat(5000) }] },
      { role: 'model', parts: [{ text: 'B'.repeat(5000) }] },
    ]);

    // Turn 1
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'C'.repeat(5000) }] },
      { role: 'model', parts: [{ text: 'D'.repeat(5000) }] },
    ]);

    // Turn 2
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'E'.repeat(5000) }] },
      { role: 'model', parts: [{ text: 'F'.repeat(5000) }] },
    ]);

    const goldenState = await harness.getGoldenState();

    // We should see MOCKED_DISTILLED_NODE replacing older bloated messages, while recent messages are untouched.
    expect(goldenState).toMatchSnapshot();
  });

  it('Scenario 4: Async-Driven Background GC via State Snapshots', async () => {
    // Mathematical Token Budgeting:
    // 200 chars ≈ 50 tokens.
    // 1 Turn (User + Model + Overhead) ≈ 50 + 50 + 20 = 120 Tokens.
    const customProfile: ContextProfile = {
      ...stressTestProfile,
      config: {
        ...stressTestProfile.config,
        // Retain 3 Turns (~360 tokens). Max 5 Turns (~600 tokens).
        budget: { maxTokens: 600, retainedTokens: 360 },
      },
    };

    const harness = await SimulationHarness.create(
      customProfile,
      mockLlmClient,
    );

    const createMessage = (index: number) =>
      `Msg ${index} `.repeat(25).padEnd(200, '.');

    // Turn 0 (~120 tokens) Total: 120
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: createMessage(0) }] },
      { role: 'model', parts: [{ text: createMessage(1) }] },
    ]);

    // Turn 1 (~120 tokens) Total: 240
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: createMessage(2) }] },
      { role: 'model', parts: [{ text: createMessage(3) }] },
    ]);

    // Turn 2 (~120 tokens) Total: 360 (At retainedTokens boundary)
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: createMessage(4) }] },
      { role: 'model', parts: [{ text: createMessage(5) }] },
    ]);

    // Turn 3 (~120 tokens) Total: 480 (Exceeds retainedTokens! Triggers GC on Turn 0 & 1)
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: createMessage(6) }] },
      { role: 'model', parts: [{ text: createMessage(7) }] },
    ]);

    // Give the async background snapshot pipeline time to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Turn 4 (~120 tokens).
    // If GC succeeded, Turn 0 and 1 are now a ~10 token snapshot.
    // Total should be: 10 (Snapshot) + 120 (Turn 2) + 120 (Turn 3) + 120 (Turn 4) = ~370 tokens.
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: createMessage(8) }] },
      { role: 'model', parts: [{ text: createMessage(9) }] },
    ]);

    const goldenState = await harness.getGoldenState();

    // We should see a MOCKED_STATE_SNAPSHOT_SUMMARY rolling up Turns 0 and 1,
    // while Turns 2, 3, and 4 remain fully intact.
    expect(goldenState).toMatchSnapshot();
  });
});
