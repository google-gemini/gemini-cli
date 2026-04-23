/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../../config/config.js';
import { isAutoModel, resolveModel } from '../../config/models.js';
import type {
  RoutingStrategy,
  RoutingDecision,
  RoutingContext,
} from '../routingStrategy.js';

/**
 * A routing strategy that respects the "Best Effort Pro" setting.
 * If the setting is enabled and the Pro model is available, it routes to Pro
 * regardless of complexity. If Pro is unavailable, it routes to Flash.
 */
export class BestEffortProStrategy implements RoutingStrategy {
  name = 'best-effort-pro';

  async route(
    context: RoutingContext,
    config: Config,
  ): Promise<RoutingDecision | null> {
    const requestedModel = config.getModel();
    if (!isAutoModel(requestedModel)) {
      return null;
    }

    const isBestEffortProEnabled = await config.getBestEffortProEnabled();
    if (!isBestEffortProEnabled) {
      return null;
    }

    const useGemini3_1 = (await config.getGemini31Launched?.()) ?? false;
    const useGemini3_1FlashLite =
      (await config.getGemini31FlashLiteLaunched?.()) ?? false;
    const hasAccessToPreview = config.getHasAccessToPreviewModel?.() ?? true;

    const availabilityService = config.getModelAvailabilityService();
    const proModel = resolveModel(
      'gemini-3.1-pro',
      useGemini3_1,
      useGemini3_1FlashLite,
      false,
      hasAccessToPreview,
      config,
    );
    const flashModel = resolveModel(
      'gemini-3.1-flash',
      useGemini3_1,
      useGemini3_1FlashLite,
      false,
      hasAccessToPreview,
      config,
    );

    const proSnapshot = availabilityService.snapshot(proModel);

    if (proSnapshot.available) {
      return {
        model: proModel,
        metadata: {
          source: this.name,
          latencyMs: 0,
          reasoning:
            'Best Effort Pro is enabled and the Pro model is available.',
        },
      };
    } else {
      return {
        model: flashModel,
        metadata: {
          source: this.name,
          latencyMs: 0,
          reasoning: `Best Effort Pro is enabled, but Pro is unavailable (${proSnapshot.reason}). Falling back to Flash.`,
        },
      };
    }
  }
}
