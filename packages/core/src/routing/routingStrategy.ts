/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, PartListUnion } from '@google/genai';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { Config } from '../config/config.js';

/**
 * The output of a routing decision. It specifies which model to use and why.
 */
export interface RoutingDecision {
  /** The model identifier string to use for the next API call (e.g., 'gemini-2.5-pro'). */
  model: string;
  /**
   * Metadata about the routing decision for logging purposes.
   */
  metadata: {
    source: string;
    latencyMs: number;
    reasoning: string;
    error?: string;
  };
}

/**
 * The context provided to the router for making a decision.
 */
export interface RoutingContext {
  /** The full history of the conversation. */
  history: Content[];
  /** The immediate request parts to be processed. */
  request: PartListUnion;
  /** An abort signal to cancel an LLM call during routing. */
  signal: AbortSignal;
  /** The model string requested for this turn, if any. */
  requestedModel?: string;
}

/**
 * The core interface that all routing strategies must implement.
 * Strategies implementing this interface may decline a request by returning null.
 */
export interface RoutingStrategy {
  /** The name of the strategy (e.g., 'fallback', 'override', 'composite'). */
  readonly name: string;

  /**
   * Determines which model to use for a given request context.
   * @param context The full context of the request.
   * @param config The current configuration.
   * @param client A reference to the GeminiClient, allowing the strategy to make its own API calls if needed.
   * @returns A promise that resolves to a RoutingDecision, or null if the strategy is not applicable.
   */
  route(
    context: RoutingContext,
    config: Config,
    baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision | null>;
}

/**
 * A strategy that is guaranteed to return a decision. It must not return null.
 * This is used to ensure that a composite chain always terminates.
 */
export interface TerminalStrategy extends RoutingStrategy {
  /**
   * Determines which model to use for a given request context.
   * @returns A promise that resolves to a RoutingDecision.
   */
  route(
    context: RoutingContext,
    config: Config,
    baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision>;
}
