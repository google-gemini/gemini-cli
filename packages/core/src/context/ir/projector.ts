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

    // Calculate exactly which nodes aged out of the retainedTokens budget to form our target delta
    const agedOutNodes = new Set<string>();
    let rollingTokens = 0;
    // Start from newest and count backwards
    for (let i = workingBuffer.length - 1; i >= 0; i--) {
      const ep = workingBuffer[i];
      const epTokens = env.tokenCalculator.calculateEpisodeListTokens([ep]);
      rollingTokens += epTokens;
      if (rollingTokens > sidecar.budget.retainedTokens) {
        agedOutNodes.add(ep.id);
        agedOutNodes.add(ep.trigger.id);
        for (const step of ep.steps) agedOutNodes.add(step.id);
        if (ep.yield) agedOutNodes.add(ep.yield.id);
      }
    }

    const processedEpisodes = await orchestrator.executeTriggerSync(
      'gc_backstop',
      workingBuffer,
      {
        currentTokens,
        maxTokens: sidecar.budget.maxTokens,
        retainedTokens: sidecar.budget.retainedTokens,
        deficitTokens: Math.max(0, currentTokens - sidecar.budget.maxTokens),
        protectedEpisodeIds: protectedIds,
        isBudgetSatisfied: currentTokens <= sidecar.budget.maxTokens,
        targetNodeIds: agedOutNodes,
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
