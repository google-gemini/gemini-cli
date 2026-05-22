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
import { powerUserProfile } from '../config/profiles.js';

expect.addSnapshotSerializer({
  test: (val) =>
    typeof val === 'string' &&
    (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      val,
    ) ||
      /\b[0-9a-f]{32}\b/i.test(val) ||
      /\bsynth_[a-zA-Z0-9_]+_[0-9a-f]{32}\b/.test(val) ||
      /[\\/]tmp[\\/]sim/.test(val)),
  print: (val) => {
    if (typeof val !== 'string') return `"${val}"`;
    let scrubbed = val
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        '<UUID>',
      )
      .replace(/\b[0-9a-f]{32}\b/gi, '<UUID>')
      .replace(/\bsynth_[a-zA-Z0-9_]+_[0-9a-f]{32}\b/g, 'synth_<NAME>_<HASH>')
      .replace(/[\\/]tmp[\\/]sim[^\s"'\]]*/g, '<MOCKED_DIR>');

    // Also scrub timestamps in filenames like blob_1234567890_...
    scrubbed = scrubbed.replace(/blob_\d+_/g, 'blob_<TIMESTAMP>_');

    return `"${scrubbed}"`;
  },
});

describe('Power User Lifecycle Tests', () => {
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

  const mockLlmClient = createMockLlmClient();

  it('should correctly execute the three-tier budget pipeline', async () => {
    // 1. Setup a Power User Stress Profile
    const powerStressProfile: ContextProfile = {
      ...powerUserProfile,
      config: {
        ...powerUserProfile.config,
        budget: {
          retainedTokens: 1000,
          normalizedTokens: 2000,
          maxTokens: 5000,
          coalescingThresholdTokens: 200,
        },
        gcStrategy: 'incremental',
      },
    };

    const harness = await SimulationHarness.create(
      powerStressProfile,
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
      { role: 'model', parts: [{ text: 'Hi!' }] },
    ]);

    // Turn 2: Large message to cross retainedTokens (1000) but stay under normalizedTokens (2000)
    // Should trigger 'retained_exceeded' (Normalization pipeline)
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'A'.repeat(800) }] },
      { role: 'model', parts: [{ text: 'B'.repeat(400) }] },
    ]);

    // Turn 3: Large message to cross normalizedTokens (2000) but stay under maxTokens (5000)
    // Should trigger 'normalized_exceeded' (Archiving pipeline)
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'C'.repeat(1200) }] },
      { role: 'model', parts: [{ text: 'D'.repeat(600) }] },
    ]);

    // Turn 4: Large message to cross maxTokens (5000)
    // Should trigger 'gc_backstop' (Emergency pipeline) AND 'nodes_aged_out' (Async BG)
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'E'.repeat(2500) }] },
      { role: 'model', parts: [{ text: 'F'.repeat(1000) }] },
    ]);

    const goldenState = await harness.getGoldenState();

    // Verify snapshots for token trajectory and final projection
    expect(goldenState).toMatchSnapshot();
  });
});
