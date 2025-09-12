/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../../config/config.js';
import { getEffectiveModel } from '../../config/models.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from '../routingStrategy.js';

export class FallbackStrategy implements RoutingStrategy {
  readonly name = 'fallback';

  async route(
    _context: RoutingContext,
    config: Config,
    _baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision | null> {
    const isInFallbackMode: boolean = config.isInFallbackMode();

    if (!isInFallbackMode) {
      return null;
    }

    const effectiveModel = getEffectiveModel(
      isInFallbackMode,
      config.getModel(),
    );
    return {
      model: effectiveModel,
      metadata: {
        source: this.name,
        latencyMs: 0,
        reasoning: `In fallback mode. Using: ${effectiveModel}`,
      },
    };
  }
}
