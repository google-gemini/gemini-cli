/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { selectModelForAvailability } from '../../availability/policyHelpers.js';
import type { Config } from '../../config/config.js';
import { resolveModel } from '../../config/models.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from '../routingStrategy.js';

export class FallbackStrategy implements RoutingStrategy {
  readonly name = 'fallback';

  async route(
    context: RoutingContext,
    config: Config,
    _baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision | null> {
    const requestedModel = context.requestedModel ?? config.getModel();
    const resolvedModel = resolveModel(
      requestedModel,
      config.getPreviewFeatures(),
    );
    const service = config.getModelAvailabilityService();
    const snapshot = service.snapshot(resolvedModel);

    if (snapshot.available) {
      return null;
    }

    const selection = selectModelForAvailability(config, requestedModel);

    if (
      selection?.selectedModel &&
      selection.selectedModel !== requestedModel
    ) {
      return {
        model: selection.selectedModel,
        metadata: {
          source: this.name,
          latencyMs: 0,
          reasoning: `Model ${requestedModel} is unavailable (${snapshot.reason}). Using fallback: ${selection.selectedModel}`,
        },
      };
    }

    return null;
  }
}
