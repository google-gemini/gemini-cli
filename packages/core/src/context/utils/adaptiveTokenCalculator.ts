/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import type { ConcreteNode } from '../graph/types.js';
import {
  StaticTokenCalculator,
  type AdvancedTokenCalculator,
} from './contextTokenCalculator.js';
import type { NodeBehaviorRegistry } from '../graph/behaviorRegistry.js';
import type { ContextEventBus, TokenGroundTruthEvent } from '../eventBus.js';
import { debugLogger } from '../../utils/debugLogger.js';

export interface AdaptiveLearningConfig {
  /** The momentum factor for the Exponential Moving Average (EMA). Defaults to 0.2. */
  learningRate?: number;
  /** The absolute maximum change allowed to the weight in a single turn. Defaults to 0.15. */
  maxStep?: number;
}

/**
 * An Adaptive Token Calculator that dynamically learns the true token cost of the user's
 * conversation by applying an Exponential Moving Average (EMA) gradient descent to
 * real usage metadata returned from the Gemini API.
 *
 * It wraps the deterministic `StaticTokenCalculator` base heuristic to ensure
 * immutable node cost caching while still surfacing a self-corrected estimate
 * to the pipeline processors.
 */
export class AdaptiveTokenCalculator implements AdvancedTokenCalculator {
  private learnedWeight = 1.0;
  private readonly baseCalculator: StaticTokenCalculator;
  private readonly learningRate: number;
  private readonly maxStep: number;

  constructor(
    charsPerToken: number,
    registry: NodeBehaviorRegistry,
    eventBus: ContextEventBus,
    private readonly getOverheadTokens?: () => number,
    config?: AdaptiveLearningConfig,
  ) {
    this.learningRate = config?.learningRate ?? 0.2;
    this.maxStep = config?.maxStep ?? 0.15;
    this.baseCalculator = new StaticTokenCalculator(charsPerToken, registry);
    eventBus.onTokenGroundTruth((event: TokenGroundTruthEvent) => {
      this.handleGroundTruth(event.actualTokens, event.promptBaseUnits);
    });
  }

  private handleGroundTruth(actualTokens: number, promptBaseUnits: number) {
    if (promptBaseUnits <= 0) return;

    const overheadTokens = this.getOverheadTokens
      ? this.getOverheadTokens()
      : 0;

    // The Gemini API token count includes the static overhead (system instruction + tools)
    // and the dynamic chat history (which we measure as promptBaseUnits).
    // We subtract the overhead so the adaptive calculator is comparing "apples to apples"
    // when learning the weight multiplier for the graph nodes.
    const actualGraphTokens = Math.max(0, actualTokens - overheadTokens);

    // Determine what ratio we should have used
    const rawTargetWeight = actualGraphTokens / promptBaseUnits;
    const oldWeight = this.learnedWeight;

    // Dampen extreme outliers *before* applying the EMA by capping the target weight
    // to a reasonable multiple of the current weight. This prevents a single massive
    // anomaly from destroying the running average.
    const targetWeight = Math.max(
      oldWeight * 0.5,
      Math.min(rawTargetWeight, oldWeight * 2.0),
    );

    // Apply Momentum (Learning Rate)
    let newWeight =
      oldWeight * (1 - this.learningRate) + targetWeight * this.learningRate;

    // Hard limit the maximum step size per turn to prevent violent oscillation
    if (newWeight > oldWeight + this.maxStep)
      newWeight = oldWeight + this.maxStep;
    if (newWeight < oldWeight - this.maxStep)
      newWeight = oldWeight - this.maxStep;

    // Clamp to reasonable absolute safety bounds
    this.learnedWeight = Math.max(0.5, Math.min(newWeight, 2.0));

    debugLogger.log(
      `[AdaptiveTokenCalculator] Learned weight updated to ${this.learnedWeight.toFixed(3)} ` +
        `(API Tokens: ${actualTokens}, Overhead: ${overheadTokens}, Graph Tokens: ${actualGraphTokens}, Base Units: ${promptBaseUnits}, Target Ratio: ${targetWeight.toFixed(3)})`,
    );
  }

  /**
   * Retrieves the current learned weight multiplier.
   */
  getLearnedWeight(): number {
    return this.learnedWeight;
  }

  /**
   * Returns the exact, unweighted Base Heuristic Units for the graph.
   * This is used exactly once per interaction to capture the baseline sent to the API.
   */
  getRawBaseUnits(nodes: readonly ConcreteNode[]): number {
    return this.baseCalculator.calculateConcreteListTokens(nodes);
  }

  /**
   * Returns the exact, unweighted Base Heuristic Units for a raw content chunk.
   */
  getRawBaseUnitsForContent(content: Content): number {
    return this.baseCalculator.calculateContentTokens(content);
  }

  calculateTokensAndBaseUnits(nodes: readonly ConcreteNode[]): {
    tokens: number;
    baseUnits: number;
  } {
    const baseUnits = this.baseCalculator.calculateConcreteListTokens(nodes);
    return {
      tokens: Math.round(baseUnits * this.learnedWeight),
      baseUnits,
    };
  }

  calculateContentTokensAndBaseUnits(content: Content): {
    tokens: number;
    baseUnits: number;
  } {
    const baseUnits = this.baseCalculator.calculateContentTokens(content);
    return {
      tokens: Math.round(baseUnits * this.learnedWeight),
      baseUnits,
    };
  }

  // --- Delegation and Weighting ---

  garbageCollectCache(liveNodeIds: ReadonlySet<string>): void {
    this.baseCalculator.garbageCollectCache(liveNodeIds);
  }

  cacheNodeTokens(node: ConcreteNode): number {
    return this.baseCalculator.cacheNodeTokens(node);
  }

  calculateTokenBreakdown(nodes: readonly ConcreteNode[]): {
    text: number;
    media: number;
    tool: number;
    overhead: number;
    total: number;
  } {
    const raw = this.baseCalculator.calculateTokenBreakdown(nodes);
    return {
      text: Math.round(raw.text * this.learnedWeight),
      media: Math.round(raw.media * this.learnedWeight),
      tool: Math.round(raw.tool * this.learnedWeight),
      overhead: Math.round(raw.overhead * this.learnedWeight),
      total: Math.round(raw.total * this.learnedWeight),
    };
  }

  estimateTokensForParts(parts: Part[]): number {
    const baseUnits = this.baseCalculator.estimateTokensForParts(parts);
    return Math.round(baseUnits * this.learnedWeight);
  }

  getTokenCost(node: ConcreteNode): number {
    const baseUnits = this.baseCalculator.getTokenCost(node);
    return Math.round(baseUnits * this.learnedWeight);
  }

  calculateConcreteListTokens(nodes: readonly ConcreteNode[]): number {
    const baseUnits = this.baseCalculator.calculateConcreteListTokens(nodes);
    return Math.round(baseUnits * this.learnedWeight);
  }

  calculateContentTokens(content: Content): number {
    const baseUnits = this.baseCalculator.calculateContentTokens(content);
    return Math.round(baseUnits * this.learnedWeight);
  }

  estimateTokensForString(text: string): number {
    const baseUnits = this.baseCalculator.estimateTokensForString(text);
    return Math.round(baseUnits * this.learnedWeight);
  }

  tokensToChars(tokens: number): number {
    // If weight is > 1.0 (we are inflating tokens), a single returned token is worth fewer chars.
    // We reverse the math: convert requested tokens to target base units, then get chars.
    return this.baseCalculator.tokensToChars(tokens / this.learnedWeight);
  }
}
