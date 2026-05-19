/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { AdaptiveTokenCalculator } from './adaptiveTokenCalculator.js';
import { NodeBehaviorRegistry } from '../graph/behaviorRegistry.js';
import { registerBuiltInBehaviors } from '../graph/builtinBehaviors.js';
import { ContextEventBus } from '../eventBus.js';
import { createDummyNode } from '../testing/contextTestUtils.js';
import { NodeType } from '../graph/types.js';

describe('AdaptiveTokenCalculator', () => {
  const registry = new NodeBehaviorRegistry();
  registerBuiltInBehaviors(registry);
  const charsPerToken = 1; // Simplifies math

  it('should initialize with a learned weight of 1.0', () => {
    const eventBus = new ContextEventBus();
    const calculator = new AdaptiveTokenCalculator(
      charsPerToken,
      registry,
      eventBus,
    );
    expect(calculator.getLearnedWeight()).toBe(1.0);
  });

  it('should dynamically update learned weight based on token ground truth events', () => {
    const eventBus = new ContextEventBus();
    const calculator = new AdaptiveTokenCalculator(
      charsPerToken,
      registry,
      eventBus,
    );

    // Initial state: weight = 1.0

    // Simulate an event where the API reported fewer tokens than our base units
    // targetWeight = 50 / 100 = 0.5
    // newWeight = 1.0 * 0.8 + 0.5 * 0.2 = 0.8 + 0.1 = 0.9
    eventBus.emitTokenGroundTruth({
      actualTokens: 50,
      promptBaseUnits: 100,
    });

    // JavaScript floating point precision means we should use toBeCloseTo
    expect(calculator.getLearnedWeight()).toBeCloseTo(0.9, 5);

    // Simulate another event
    // newWeight = 0.9 * 0.8 + (150 / 100) * 0.2 = 0.72 + 0.3 = 1.02
    eventBus.emitTokenGroundTruth({
      actualTokens: 150,
      promptBaseUnits: 100,
    });

    expect(calculator.getLearnedWeight()).toBeCloseTo(1.02, 5);
  });

  it('should clamp the learned weight between 0.5 and 2.0', () => {
    const eventBus = new ContextEventBus();
    const calculator = new AdaptiveTokenCalculator(
      charsPerToken,
      registry,
      eventBus,
    );

    // Push weight up extremely high (API returns 10x tokens)
    for (let i = 0; i < 20; i++) {
      eventBus.emitTokenGroundTruth({
        actualTokens: 1000,
        promptBaseUnits: 100,
      });
    }
    expect(calculator.getLearnedWeight()).toBe(2.0);

    // Push weight down extremely low (API returns 0 tokens)
    for (let i = 0; i < 20; i++) {
      eventBus.emitTokenGroundTruth({ actualTokens: 0, promptBaseUnits: 100 });
    }
    expect(calculator.getLearnedWeight()).toBe(0.5);
  });

  it('should correctly apply the learned weight to node calculations while keeping raw base units stable', () => {
    const eventBus = new ContextEventBus();
    const calculator = new AdaptiveTokenCalculator(
      charsPerToken,
      registry,
      eventBus,
    );

    // Decrease the weight to exactly 0.5
    for (let i = 0; i < 20; i++) {
      eventBus.emitTokenGroundTruth({ actualTokens: 0, promptBaseUnits: 100 });
    }

    const turn1Id = 'turn-1';
    const node1 = createDummyNode(turn1Id, NodeType.USER_PROMPT);

    // Get raw base units directly
    const rawTokens = calculator.calculateTokensAndBaseUnits([node1]).baseUnits;

    // Get adjusted tokens
    const adjustedTokens = calculator.calculateConcreteListTokens([node1]);

    expect(adjustedTokens).toBe(Math.round(rawTokens * 0.5));
  });

  it('should ignore ground truth events with 0 promptBaseUnits to prevent division by zero', () => {
    const eventBus = new ContextEventBus();
    const calculator = new AdaptiveTokenCalculator(
      charsPerToken,
      registry,
      eventBus,
    );

    eventBus.emitTokenGroundTruth({
      actualTokens: 100,
      promptBaseUnits: 0,
    });

    expect(calculator.getLearnedWeight()).toBe(1.0);
  });

  it('should subtract overhead tokens from actual tokens when determining target weight', () => {
    const eventBus = new ContextEventBus();
    const getOverheadTokens = () => 40;
    const calculator = new AdaptiveTokenCalculator(
      charsPerToken,
      registry,
      eventBus,
      getOverheadTokens,
    );

    // Initial state: weight = 1.0

    // Simulate an event where the API reported 100 tokens, and our base units were 100
    // But overhead is 40.
    // actualGraphTokens = 100 - 40 = 60
    // rawTargetWeight = 60 / 100 = 0.6
    // targetWeight = Math.max(0.5, 0.6) = 0.6
    // newWeight = 1.0 * 0.8 + 0.6 * 0.2 = 0.8 + 0.12 = 0.92
    eventBus.emitTokenGroundTruth({
      actualTokens: 100,
      promptBaseUnits: 100,
    });

    expect(calculator.getLearnedWeight()).toBeCloseTo(0.92, 5);
  });

  it('should enforce the maxStep limit to prevent violent oscillation from massive outliers', () => {
    const eventBus = new ContextEventBus();
    const maxStep = 0.05; // Tight limit
    const calculator = new AdaptiveTokenCalculator(
      charsPerToken,
      registry,
      eventBus,
      undefined,
      { maxStep },
    );

    // Initial state: weight = 1.0

    // Simulate a massive outlier where the API reports 10,000 tokens for 100 base units.
    // rawTargetWeight = 100
    // targetWeight = Math.min(100, 1.0 * 2.0) = 2.0
    // emaWeight = 1.0 * 0.8 + 2.0 * 0.2 = 1.2
    // BUT maxStep is 0.05, so the actual step is clamped.
    // finalWeight = 1.0 + 0.05 = 1.05
    eventBus.emitTokenGroundTruth({
      actualTokens: 10000,
      promptBaseUnits: 100,
    });

    expect(calculator.getLearnedWeight()).toBeCloseTo(1.05, 5);

    // Simulate a massive under-estimation
    // rawTargetWeight = 0
    // targetWeight = Math.max(0, 1.05 * 0.5) = 0.525
    // emaWeight = 1.05 * 0.8 + 0.525 * 0.2 = 0.84 + 0.105 = 0.945
    // BUT maxStep is 0.05, so step is clamped: 1.05 - 0.05 = 1.0
    eventBus.emitTokenGroundTruth({
      actualTokens: 0,
      promptBaseUnits: 100,
    });

    expect(calculator.getLearnedWeight()).toBeCloseTo(1.0, 5);
  });
});
