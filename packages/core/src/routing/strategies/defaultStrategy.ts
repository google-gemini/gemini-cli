/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
import { GeminiClient } from '../../core/client.js';
import {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from '../routingStrategy.js';

/**
 * This strategy maintains the original, non-routing behavior.
 * It always selects the default model specified in the application configuration.
 */
export class DefaultStrategy implements RoutingStrategy {
  constructor(private config: Config) {}

  async route(
    _context: RoutingContext,
    _client: GeminiClient,
  ): Promise<RoutingDecision> {
    return {
      model: this.config.getModel(),
      reason: 'DefaultStrategy: Using model from config.',
    };
  }
}
