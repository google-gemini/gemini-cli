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
  TerminalStrategy,
} from '../routingStrategy.js';
import { resolveModel } from '../../config/models.js';

export class DefaultStrategy implements TerminalStrategy {
  readonly name = 'default';

  async route(
    _context: RoutingContext,
    config: Config,
    _baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision> {
    const defaultModel = resolveModel(config.getModel());
    return {
      model: defaultModel,
      metadata: {
        source: this.name,
        latencyMs: 0,
        reasoning: `Routing to default model: ${defaultModel}`,
      },
    };
  }
}
