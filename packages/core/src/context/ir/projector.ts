/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import { IrMapper } from './mapper.js';
import type { ConcreteNode } from './types.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type {
  ContextEnvironment,
  ContextTracer,
} from '../sidecar/environment.js';
import type { PipelineOrchestrator } from '../sidecar/orchestrator.js';
import type { SidecarConfig } from '../sidecar/types.js';

export class IrProjector {
  /**
   * Orchestrates the final projection: takes a working buffer view (The Ship),
   * applies the Immediate Sanitization pipeline, and enforces token boundaries.
   */
  static async project(
    ship: readonly ConcreteNode[],
    orchestrator: PipelineOrchestrator,
    sidecar: SidecarConfig,
    tracer: ContextTracer,
    env: ContextEnvironment,
    protectedIds: Set<string>,
  ): Promise<Content[]> {
    if (!sidecar.budget) {
      const contents = IrMapper.fromIr(ship);
      tracer.logEvent('IrProjector', 'Projected Context to LLM (No Budget)', {
        projectedContext: contents,
      });
      return contents;
    }

    const maxTokens = sidecar.budget.maxTokens;
    const currentTokens = env.tokenCalculator.calculateConcreteListTokens(ship);

    // V0: Always protect the first node (System Prompt) and the last turn
    if (ship.length > 0) {
      protectedIds.add(ship[0].id);
      if (ship[0].logicalParentId) protectedIds.add(ship[0].logicalParentId);

      const lastNode = ship[ship.length - 1];
      protectedIds.add(lastNode.id);
      if (lastNode.logicalParentId) protectedIds.add(lastNode.logicalParentId);
    }

    if (currentTokens <= maxTokens) {
      tracer.logEvent(
        'IrProjector',
        `View is within maxTokens (${currentTokens} <= ${maxTokens}). Returning view.`,
      );
      const contents = IrMapper.fromIr(ship);
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
    for (let i = ship.length - 1; i >= 0; i--) {
      const node = ship[i];
      const nodeTokens = node.metadata.currentTokens;
      rollingTokens += nodeTokens;
      if (rollingTokens > sidecar.budget.retainedTokens) {
        agedOutNodes.add(node.id);
      }
    }

    const processedShip = await orchestrator.executeTriggerSync(
      'gc_backstop',
      ship,
      agedOutNodes,
      {
        currentTokens,
        maxTokens: sidecar.budget.maxTokens,
        retainedTokens: sidecar.budget.retainedTokens,
        deficitTokens: Math.max(0, currentTokens - sidecar.budget.maxTokens),
        protectedLogicalIds: protectedIds,
        isBudgetSatisfied: currentTokens <= sidecar.budget.maxTokens,
      },
    );

    const finalTokens =
      env.tokenCalculator.calculateConcreteListTokens(processedShip);
    tracer.logEvent(
      'IrProjector',
      `Finished projection. Final token count: ${finalTokens}.`,
    );
    debugLogger.log(
      `Context Manager finished. Final actual token count: ${finalTokens}.`,
    );

    // Apply skipList logic to abstract over summarized nodes
    const skipList = new Set<string>();
    for (const node of processedShip) {
      if (node.abstractsIds) {
        for (const id of node.abstractsIds) skipList.add(id);
      }
    }

    const visibleShip = processedShip.filter((n) => !skipList.has(n.id));

    const contents = IrMapper.fromIr(visibleShip);
    tracer.logEvent('IrProjector', 'Projected Sanitized Context to LLM', {
      projectedContextSanitized: contents,
    });
    return contents;
  }
}
