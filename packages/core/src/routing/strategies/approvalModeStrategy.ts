/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../../config/config.js';
import {
  isAutoModel,
  resolveClassifierModel,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_PRO,
} from '../../config/models.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import { ApprovalMode } from '../../policy/types.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from '../routingStrategy.js';

/**
 * A strategy that routes based on the current ApprovalMode and plan status.
 *
 * - In PLAN mode: Routes to the PRO model for high-quality planning.
 * - In other modes with an approved plan: Routes to the FLASH model for efficient implementation.
 */
export class ApprovalModeStrategy implements RoutingStrategy {
  readonly name = 'approval-mode';

  async route(
    context: RoutingContext,
    config: Config,
    _baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision | null> {
    const model = context.requestedModel ?? config.getModel();

    // This strategy only applies to "auto" models.
    if (!isAutoModel(model, config)) {
      return null;
    }

    if (!(await config.getPlanModeRoutingEnabled())) {
      return null;
    }

    const startTime = Date.now();
    const approvalMode = config.getApprovalMode();
    const approvedPlanPath = config.getApprovedPlanPath();

    const [useGemini3_1, useCustomToolModel] = await Promise.all([
      config.getGemini31Launched(),
      config.getUseCustomToolModel(),
    ]);

    // 1. Planning Phase: If ApprovalMode === PLAN, explicitly route to the Pro model.
    if (approvalMode === ApprovalMode.PLAN) {
      const proModel = resolveClassifierModel(
        model,
        GEMINI_MODEL_ALIAS_PRO,
        useGemini3_1,
        useCustomToolModel,
      );
      return {
        model: proModel,
        metadata: {
          source: this.name,
          latencyMs: Date.now() - startTime,
          reasoning: 'Routing to Pro model because ApprovalMode is PLAN.',
        },
      };
    } else if (approvedPlanPath) {
      // 2. Implementation Phase: If ApprovalMode !== PLAN AND an approved plan path is set, prefer the Flash model.
      const flashModel = resolveClassifierModel(
        model,
        GEMINI_MODEL_ALIAS_FLASH,
        useGemini3_1,
        useCustomToolModel,
      );
      return {
        model: flashModel,
        metadata: {
          source: this.name,
          latencyMs: Date.now() - startTime,
          reasoning: `Routing to Flash model because an approved plan exists at ${approvedPlanPath}.`,
        },
      };
    }

    return null;
  }
}
