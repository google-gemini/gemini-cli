/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from '../routingStrategy.js';
import { DEFAULT_GEMINI_MODEL } from '../../config/models.js';

export class DefaultStrategy implements RoutingStrategy {
  async route(
    _context: RoutingContext,
    _baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision> {
    // Return the default model for Gemini CLI
    return {
      model: DEFAULT_GEMINI_MODEL,
      reason: `Routing to default model: ${DEFAULT_GEMINI_MODEL}`,
      metadata: {
        source: 'Default',
        latencyMs: 0,
      },
    };
  }
}
