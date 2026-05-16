/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SimulationHarness } from './simulationHarness.js';
import { createMockLlmClient } from '../testing/contextTestUtils.js';
import type { ContextProfile } from '../config/profiles.js';
import { generalistProfile } from '../config/profiles.js';
import type { Content } from '@google/genai';

describe('Context Manager Hysteresis Tests', () => {
  const mockLlmClient = createMockLlmClient(['<SNAPSHOT>']);

  const getHysteresisConfig = (threshold: number): ContextProfile => ({
    ...generalistProfile,
    name: 'Hysteresis Stress Test',
    config: {
      budget: {
        maxTokens: 5000,
        retainedTokens: 1000,
        coalescingThresholdTokens: threshold,
      },
    },
  });

  const getProjectionTokens = (proj: Content[], harness: SimulationHarness) =>
    proj.reduce(
      (sum, c) => sum + harness.env.tokenCalculator.calculateContentTokens(c),
      0,
    );

  it('should block consolidation when deficit is below coalescing threshold', async () => {
    const threshold = 1500;
    const harness = await SimulationHarness.create(
      getHysteresisConfig(threshold),
      mockLlmClient,
    );

    // Turn 0: INIT
    await harness.simulateTurn([{ role: 'user', parts: [{ text: 'INIT' }] }]);

    // Turn 1: Add ~500 tokens
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'A'.repeat(500) }] },
    ]);

    // Turn 2: Add ~1000 tokens. Total ~1500. Deficit ~500 < 1500.
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'B'.repeat(1000) }] },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 100));
    let state = await harness.getGoldenState();
    // No snapshot because maxTokens (5000) not exceeded, and deficit < threshold.
    expect(
      state.finalProjection.some((c) =>
        c.parts?.some((p) => p.text?.includes('<SNAPSHOT>')),
      ),
    ).toBe(false);

    // Turn 3: Add ~3000 tokens. Total ~4500.
    // Deficit ~3500 > 1500. TRIGGER!
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'C'.repeat(3000) }] },
    ]);

    // Give it a moment for the async task to finish
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Exceed maxTokens to force a render that shows the snapshot
    // Add ~3000 tokens. Total ~7500 > 5000.
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'D'.repeat(3000) }] },
    ]);

    state = await harness.getGoldenState();
    expect(
      state.finalProjection.some((c) =>
        c.parts?.some((p) => p.text?.includes('<SNAPSHOT>')),
      ),
    ).toBe(true);
  });

  it('should track growth from the new baseline after consolidation', async () => {
    const threshold = 1000;
    const harness = await SimulationHarness.create(
      getHysteresisConfig(threshold),
      mockLlmClient,
    );

    // 1. Trigger first consolidation
    // Add ~3000 tokens. Total ~3000. Deficit ~2000 > 1000.
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'A'.repeat(3000) }] },
    ]);
    await harness.simulateTurn([{ role: 'user', parts: [{ text: 'B' }] }]); // Make eligible

    await new Promise((resolve) => setTimeout(resolve, 500));
    // Exceed maxTokens (5000) to see it
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'X'.repeat(3000) }] },
    ]);

    // Get baseline tokens
    let state = await harness.getGoldenState();
    expect(
      state.finalProjection.some((c) =>
        c.parts?.some((p) => p.text?.includes('<SNAPSHOT>')),
      ),
    ).toBe(true);

    const baselineTokens = getProjectionTokens(state.finalProjection, harness);

    // 2. Add nodes again, staying below threshold growth
    // Add ~500 tokens. Growth ~500 < 1000.
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'C'.repeat(500) }] },
    ]);
    await harness.simulateTurn([{ role: 'user', parts: [{ text: 'D' }] }]); // Make eligible

    await new Promise((resolve) => setTimeout(resolve, 200));
    state = await harness.getGoldenState();
    const currentTokens = getProjectionTokens(state.finalProjection, harness);
    // Should not have shrunk further (except for D's small addition)
    expect(currentTokens).toBeGreaterThanOrEqual(baselineTokens);

    // 3. Exceed threshold growth
    // Add ~2000 tokens. Growth = ~500 + ~2000 = ~2500 > 1000.
    await harness.simulateTurn([
      { role: 'user', parts: [{ text: 'E'.repeat(2000) }] },
    ]);
    await harness.simulateTurn([{ role: 'user', parts: [{ text: 'F' }] }]); // Make eligible

    await new Promise((resolve) => setTimeout(resolve, 500));
    state = await harness.getGoldenState();
    const finalTokens = getProjectionTokens(state.finalProjection, harness);
    // Now it should have consolidated again (E should be replaced by a snapshot eventually)
    expect(finalTokens).toBeLessThan(currentTokens + 2000);
  });
});
