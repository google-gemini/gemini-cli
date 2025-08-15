/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, PartListUnion } from '@google/genai';
import { GeminiClient } from '../core/client.js';

/**
 * The output of a routing decision. It specifies which model to use and why.
 */
export interface RoutingDecision {
  /** The model identifier string to use for the next API call (e.g., 'gemini-2.5-pro'). */
  model: string;
  /** A brief, loggable explanation of why this model was chosen. */
  reason: string;
  /**
   * Metadata about the routing decision for logging purposes.
   */
  metadata: {
    source: 'Classifier' | 'Fallback' | 'Forced';
    latencyMs: number;
    reasoning?: string;
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
  /** Prompt Id of the request being made. */
  promptId: string;
  /** An abort signal to cancel an LLM call during routing. */
  signal: AbortSignal;
  /**
   * If provided, the router will be bypassed and this model will be used directly.
   * This is the override mechanism for specific internal tasks or user settings.
   */
  forcedModel?: string;
}

/**
 * The core interface that all routing strategies must implement.
 */
export interface RoutingStrategy {
  /**
   * Determines which model to use for a given request context.
   * @param context The full context of the request.
   * @param client A reference to the GeminiClient, allowing the strategy to make its own API calls if needed.
   * @returns A promise that resolves to a RoutingDecision.
   */
  route(
    context: RoutingContext,
    client: GeminiClient,
  ): Promise<RoutingDecision>;
}
