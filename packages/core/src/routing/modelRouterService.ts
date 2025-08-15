/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { GeminiClient } from '../core/client.js';
import { logModelRouting } from '../telemetry/loggers.js';
import { ModelRoutingEvent } from '../telemetry/types.js';
import { getErrorMessage } from '../utils/errors.js';
import {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from './routingStrategy.js';
import { ClassifierStrategy } from './strategies/classifierStrategy.js';

/**
 * A centralized service for making model routing decisions.
 */
export class ModelRouterService {
  private config: Config;
  private strategy: RoutingStrategy;

  constructor(config: Config) {
    this.config = config;
    this.strategy = new ClassifierStrategy();
  }

  /**
   * Determines which model to use for a given request context.
   *
   * @param context The full context of the request.
   * @param client A reference to the GeminiClient.
   * @returns A promise that resolves to a RoutingDecision.
   */
  async route(
    context: RoutingContext,
    client: GeminiClient,
  ): Promise<RoutingDecision> {
    const startTime = Date.now();
    // Honor the override mechanism.
    if (context.forcedModel) {
      const decision: RoutingDecision = {
        model: context.forcedModel,
        reason: `Routing bypassed by forced model directive. Using: ${context.forcedModel}`,
        metadata: {
          source: 'Forced',
          latencyMs: 0,
        },
      };
      const event: ModelRoutingEvent = {
        'event.name': 'model_routing',
        'event.timestamp': new Date().toISOString(),
        decision_model: decision.model,
        decision_source: 'Forced',
        routing_latency_ms: 0,
        failed: false,
      };
      logModelRouting(this.config, event);
      return decision;
    }

    try {
      // If no override is present, delegate to the currently configured strategy.
      const decision = await this.strategy.route(context, client);
      const event: ModelRoutingEvent = {
        'event.name': 'model_routing',
        'event.timestamp': new Date().toISOString(),
        decision_model: decision.model,
        decision_source: decision.metadata.source,
        routing_latency_ms: decision.metadata.latencyMs,
        classifier_reasoning: decision.metadata.reasoning,
        failed: false,
      };
      logModelRouting(this.config, event);
      return decision;
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = getErrorMessage(error);
      console.log(
        `ClassifierStrategy failed: ${errorMessage}. Defaulting to pro model.`,
      );
      const decision: RoutingDecision = {
        model: DEFAULT_GEMINI_MODEL,
        reason:
          'ClassifierStrategy: Failed to classify, defaulting to pro model.',
        metadata: {
          source: 'Fallback',
          latencyMs: latency,
          error: errorMessage,
        },
      };

      const event: ModelRoutingEvent = {
        'event.name': 'model_routing',
        'event.timestamp': new Date().toISOString(),
        decision_model: decision.model,
        decision_source: 'Fallback',
        routing_latency_ms: latency,
        failed: true,
        error_message: errorMessage,
      };
      logModelRouting(this.config, event);
      return decision;
    }
  }
}
