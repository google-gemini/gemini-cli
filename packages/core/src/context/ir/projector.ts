/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import { IrMapper } from './mapper.js';
import type { Episode } from './types.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type {
  ContextEnvironment,
  ContextTracer,
} from '../sidecar/environment.js';
import type { PipelineOrchestrator } from '../sidecar/orchestrator.js';
import type { SidecarConfig } from '../sidecar/types.js';

export class IrProjector {
  /**
   * Orchestrates the final projection: takes a working buffer view,
   * applies the Immediate Sanitization pipeline, and enforces token boundaries.
   */
  static async project(
    workingBuffer: Episode[],
    orchestrator: PipelineOrchestrator,
    sidecar: SidecarConfig,
    tracer: ContextTracer,
    env: ContextEnvironment,
    protectedIds: Set<string>,
  ): Promise<Content[]> {
    if (!sidecar.budget) {
      const contents = IrMapper.fromIr(workingBuffer);
      tracer.logEvent('IrProjector', 'Projected Context to LLM (No Budget)', {
        projectedContext: contents,
      });
      return contents;
    }

    const maxTokens = sidecar.budget.maxTokens;
    const currentTokens =
      env.tokenCalculator.calculateEpisodeListTokens(workingBuffer);

    if (currentTokens <= maxTokens) {
      tracer.logEvent(
        'IrProjector',
        `View is within maxTokens (${currentTokens} <= ${maxTokens}). Returning view.`,
      );
      const contents = IrMapper.fromIr(workingBuffer);
      tracer.logEvent('IrProjector', 'Projected Context to LLM', {
        projectedContext: contents,
      });
      return contents;
    }

    tracer.logEvent(
      'IrProjector',
      `View exceeds maxTokens (${currentTokens} > ${maxTokens}). Hitting Synchronous Pressure Barrier.`,
    );
    debugLogger.log(
      `Context Manager Synchronous Barrier triggered: View at ${currentTokens} tokens (limit: ${maxTokens}).`,
    );

    const processedEpisodes = await orchestrator.executePipeline(
      'Immediate Sanitization',
      workingBuffer,
      {
        currentTokens,
        maxTokens: sidecar.budget.maxTokens,
        retainedTokens: sidecar.budget.retainedTokens,
        deficitTokens: Math.max(0, currentTokens - sidecar.budget.maxTokens),
        protectedEpisodeIds: protectedIds,
        isBudgetSatisfied: currentTokens <= sidecar.budget.maxTokens,
      },
    );

    const finalTokens =
      env.tokenCalculator.calculateEpisodeListTokens(processedEpisodes);
    tracer.logEvent(
      'IrProjector',
      `Finished projection. Final token count: ${finalTokens}.`,
    );
    debugLogger.log(
      `Context Manager finished. Final actual token count: ${finalTokens}.`,
    );

    const contents = IrMapper.fromIr(processedEpisodes);
    tracer.logEvent('IrProjector', 'Projected Sanitized Context to LLM', {
      projectedContextSanitized: contents,
    });
    return contents;
  }
}
