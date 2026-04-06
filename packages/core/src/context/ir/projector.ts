/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import { IrMapper } from './mapper.js';
import type { Episode } from './types.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { ContextEnvironment, ContextTracer } from '../sidecar/environment.js';
import type { PipelineOrchestrator } from '../sidecar/orchestrator.js';
import type { SidecarConfig } from '../sidecar/types.js';
import { calculateEpisodeListTokens } from '../utils/contextTokenCalculator.js';

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
    protectedIds: Set<string>
  ): Promise<Content[]> {
    if (!sidecar.budget) {
      return this.projectAndDump(workingBuffer, env);
    }

    const maxTokens = sidecar.budget.maxTokens;
    let currentTokens = calculateEpisodeListTokens(workingBuffer);

    if (currentTokens <= maxTokens) {
      tracer.logEvent('IrProjector', `View is within maxTokens (${currentTokens} <= ${maxTokens}). Returning view.`);
      return this.projectAndDump(workingBuffer, env);
    }

    tracer.logEvent('IrProjector', `View exceeds maxTokens (${currentTokens} > ${maxTokens}). Hitting Synchronous Pressure Barrier.`);
    debugLogger.log(`Context Manager Synchronous Barrier triggered: View at ${currentTokens} tokens (limit: ${maxTokens}).`);

    const processedEpisodes = await orchestrator.executePipeline('Immediate Sanitization', workingBuffer, {
      currentTokens: currentTokens,
      maxTokens: sidecar.budget.maxTokens,
      retainedTokens: sidecar.budget.retainedTokens,
      deficitTokens: Math.max(0, currentTokens - sidecar.budget.maxTokens),
      protectedEpisodeIds: protectedIds,
      isBudgetSatisfied: currentTokens <= sidecar.budget.maxTokens, 
    });

    const finalTokens = calculateEpisodeListTokens(processedEpisodes);
    tracer.logEvent('IrProjector', `Finished projection. Final token count: ${finalTokens}.`);
    debugLogger.log(`Context Manager finished. Final actual token count: ${finalTokens}.`);

    return this.projectAndDump(processedEpisodes, env);
  }

  /**
   * Converts the internal IR graph into a flat Content[] array for the LLM.
   * If tracing is enabled via environment variables, dumps the payload to disk.
   */
  private static async projectAndDump(episodes: Episode[], env: ContextEnvironment): Promise<Content[]> {
    const contents = IrMapper.fromIr(episodes);

    if (process.env['GEMINI_DUMP_CONTEXT'] === 'true') {
      try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const dumpPath = path.join(env.traceDir, '.gemini', 'projected_context.json');
        await fs.mkdir(path.dirname(dumpPath), { recursive: true });
        await fs.writeFile(dumpPath, JSON.stringify(contents, null, 2), 'utf-8');
        debugLogger.log(`[Observability] Context successfully dumped to ${dumpPath}`);
      } catch (e) {
        debugLogger.error(`Failed to dump context: ${e}`);
      }
    }

    return contents;
  }
}
