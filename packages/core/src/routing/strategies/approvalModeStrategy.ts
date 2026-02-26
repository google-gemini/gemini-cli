/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../../config/config.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  isAutoModel,
  isPreviewModel,
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
    if (!isAutoModel(model)) {
      return null;
    }

    if (!(await config.getPlanModeRoutingEnabled())) {
      return null;
    }

    const startTime = Date.now();
    const approvalMode = config.getApprovalMode();
    const approvedPlanPath = config.getApprovedPlanPath();

    const isPreview = isPreviewModel(model);

    // 1. Planning Phase: If ApprovalMode === PLAN, explicitly route to the Pro model.
    if (approvalMode === ApprovalMode.PLAN) {
      const proModel = isPreview ? PREVIEW_GEMINI_MODEL : DEFAULT_GEMINI_MODEL;
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
      const flashModel = isPreview
        ? PREVIEW_GEMINI_FLASH_MODEL
        : DEFAULT_GEMINI_FLASH_MODEL;
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
