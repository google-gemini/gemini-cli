/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from './routingStrategy.js';
import { DefaultStrategy } from './strategies/defaultStrategy.js';

/**
 * A centralized service for making model routing decisions.
 */
export class ModelRouterService {
  private config: Config;
  private strategy: RoutingStrategy;

  constructor(config: Config) {
    this.config = config;
    this.strategy = new DefaultStrategy();
  }

  /**
   * Determines which model to use for a given request context.
   *
   * @param context The full context of the request.
   * @returns A promise that resolves to a RoutingDecision.
   */
  async route(context: RoutingContext): Promise<RoutingDecision> {
    // Return fallback model if in fallback mode.
    if (this.config.isInFallbackMode()) {
      return {
        model: DEFAULT_GEMINI_FLASH_MODEL,
        reason: `In fallback mode. Using: ${DEFAULT_GEMINI_FLASH_MODEL}`,
        metadata: {
          source: 'Fallback',
          latencyMs: 0,
        },
      };
    }

    // Honor the override mechanism.
    if (context.explicitModel) {
      const decision: RoutingDecision = {
        model: context.explicitModel,
        reason: `Routing bypassed by forced model directive. Using: ${context.explicitModel}`,
        metadata: {
          source: 'Explicit',
          latencyMs: 0,
        },
      };

      return decision;
    }

    return this.strategy.route(context, this.config.getBaseLlmClient());
  }
}
