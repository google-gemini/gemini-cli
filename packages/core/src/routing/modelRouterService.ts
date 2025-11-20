/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import {
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../config/models.js';
import type {
  RoutingContext,
  RoutingDecision,
  TerminalStrategy,
} from './routingStrategy.js';
import { DefaultStrategy } from './strategies/defaultStrategy.js';
import { ClassifierStrategy } from './strategies/classifierStrategy.js';
import { CompositeStrategy } from './strategies/compositeStrategy.js';
import { FallbackStrategy } from './strategies/fallbackStrategy.js';
import { OverrideStrategy } from './strategies/overrideStrategy.js';

import { logModelRouting } from '../telemetry/loggers.js';
import { ModelRoutingEvent } from '../telemetry/types.js';

/**
 * A centralized service for making model routing decisions.
 */
export class ModelRouterService {
  private config: Config;
  private strategy: TerminalStrategy;

  constructor(config: Config) {
    this.config = config;
    this.strategy = this.initializeDefaultStrategy();
  }

  private initializeDefaultStrategy(): TerminalStrategy {
    // Initialize the composite strategy with the desired priority order.
    // The strategies are ordered in order of highest priority.
    return new CompositeStrategy(
      [
        new FallbackStrategy(),
        new OverrideStrategy(),
        new ClassifierStrategy(),
        new DefaultStrategy(),
      ],
      'agent-router',
    );
  }

  /**
   * Determines which model to use for a given request context.
   *
   * @param context The full context of the request.
   * @returns A promise that resolves to a RoutingDecision.
   */
  async route(context: RoutingContext): Promise<RoutingDecision> {
    const startTime = Date.now();
    let decision: RoutingDecision;

    try {
      decision = await this.strategy.route(
        context,
        this.config,
        this.config.getBaseLlmClient(),
      );

      // Unified Preview Model Logic:
      // If the decision is to use 'gemini-2.5-pro' and preview features are enabled,
      // we attempt to upgrade to 'gemini-3.0-pro' (Preview Model).
      if (
        decision.model === DEFAULT_GEMINI_MODEL &&
        this.config.getPreviewFeatures() &&
        !decision.metadata.source.includes('override')
      ) {
        // We ALWAYS attempt to upgrade to Preview Model here.
        // If we are in fallback mode, the 'previewModelBypassMode' flag (handled in handler.ts/geminiChat.ts)
        // will ensure we downgrade to 2.5 Pro for the actual API call if needed.
        // This allows us to "probe" Preview Model periodically (i.e., every new request tries Preview Model first).
        decision.model = PREVIEW_GEMINI_MODEL;
        decision.metadata.source += ' (Preview Model)';
        decision.metadata.reasoning += ' (Upgraded to Preview Model)';
      }

      const event = new ModelRoutingEvent(
        decision.model,
        decision.metadata.source,
        decision.metadata.latencyMs,
        decision.metadata.reasoning,
        false, // failed
        undefined, // error_message
      );
      logModelRouting(this.config, event);

      return decision;
    } catch (e) {
      const failed = true;
      const error_message = e instanceof Error ? e.message : String(e);
      // Create a fallback decision for logging purposes
      // We do not actually route here. This should never happen so we should
      // fail loudly to catch any issues where this happens.
      decision = {
        model: this.config.getModel(),
        metadata: {
          source: 'router-exception',
          latencyMs: Date.now() - startTime,
          reasoning: 'An exception occurred during routing.',
          error: error_message,
        },
      };

      const event = new ModelRoutingEvent(
        decision.model,
        decision.metadata.source,
        decision.metadata.latencyMs,
        decision.metadata.reasoning,
        failed,
        error_message,
      );

      logModelRouting(this.config, event);

      throw e;
    }
  }
}
