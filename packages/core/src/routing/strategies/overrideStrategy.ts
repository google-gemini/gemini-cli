/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../../config/config.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from '../routingStrategy.js';

/**
 * Handles cases where the user explicitly specifies a model (override).
 */
export class OverrideStrategy implements RoutingStrategy {
  readonly name = 'override';

  async route(
    _context: RoutingContext,
    config: Config,
    _baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision | null> {
    const overrideModel = config.getModel();
    if (overrideModel) {
      return {
        model: overrideModel,
        metadata: {
          source: this.name,
          latencyMs: 0,
          reasoning: `Routing bypassed by forced model directive. Using: ${overrideModel}`,
        },
      };
    }
    // No override specified, pass to the next strategy.
    return null;
  }
}
