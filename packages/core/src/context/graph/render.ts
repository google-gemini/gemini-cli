/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { ConcreteNode } from './types.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { ContextTracer } from '../tracer.js';
import type { ContextProfile } from '../config/profiles.js';
import type { PipelineOrchestrator } from '../pipeline/orchestrator.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { performCalibration } from '../utils/tokenCalibration.js';
import type { AdvancedTokenCalculator } from '../utils/contextTokenCalculator.js';
import type { HistoryTurn } from '../../core/agentChatHistory.js';
import { ContextWorkingBufferImpl } from '../pipeline/contextWorkingBuffer.js';

export interface RenderOptions {
  protectionReasons?: Map<string, string>;
  header?: Content;
  /**
   * If true, the most recent turn in the graph will not be considered for
   * consolidation (snapshots) or included in the returned history.
   * This is used for "late-binding" the prompt.
   */
  lateBindPrompt?: boolean;
}

/**
 * Maps the Episodic Context Graph back into a list of HistoryTurns for transmission.
 * It applies synchronous context management (GC backstop) if the budget is exceeded.
 */
export async function render(
  nodes: readonly ConcreteNode[],
  orchestrator: PipelineOrchestrator,
  sidecar: ContextProfile,
  tracer: ContextTracer,
  env: ContextEnvironment,
  advancedTokenCalculator: AdvancedTokenCalculator,
  options: RenderOptions = {},
): Promise<{
  history: HistoryTurn[];
  pendingHistory: HistoryTurn[];
  didApplyManagement: boolean;
  baseUnits: number;
  processedNodes: readonly ConcreteNode[];
}> {
  const { protectionReasons = new Map(), header, lateBindPrompt } = options;
  let headerTokens = 0;
  let headerBaseUnits = 0;
  if (header) {
    const costs =
      advancedTokenCalculator.calculateContentTokensAndBaseUnits(header);
    headerTokens = costs.tokens;
    headerBaseUnits = costs.baseUnits;
  }

  const lastTurnId = nodes[nodes.length - 1]?.turnId;

  if (!sidecar.config.budget) {
    const allVisibleNodes = nodes;

    const managedNodes =
      lateBindPrompt && lastTurnId
        ? allVisibleNodes.filter((n) => n.turnId !== lastTurnId)
        : allVisibleNodes;

    const pendingNodes =
      lateBindPrompt && lastTurnId
        ? allVisibleNodes.filter((n) => n.turnId === lastTurnId)
        : [];

    const history = env.graphMapper.fromGraph(managedNodes);
    const pendingHistory = env.graphMapper.fromGraph(pendingNodes);

    tracer.logEvent('Render', 'Render Context to LLM (No Budget)', {
      renderedContext: history,
      pendingContext: pendingHistory,
    });

    const baseUnits =
      advancedTokenCalculator.getRawBaseUnits(allVisibleNodes) +
      headerBaseUnits;

    return {
      history,
      pendingHistory,
      didApplyManagement: false,
      baseUnits,
      processedNodes: nodes,
    };
  }

  const maxTokens = sidecar.config.budget.maxTokens;

  const { tokens: graphTokens } =
    advancedTokenCalculator.calculateTokensAndBaseUnits(nodes);

  const currentTokens = graphTokens + headerTokens;

  const protectedIds = new Set(protectionReasons.keys());

  tracer.logEvent('Render', 'Budget Audit', {
    maxTokens,
    retainedTokens: sidecar.config.budget.retainedTokens,
    graphTokens,
    headerTokens,
    currentTokens,
    pressure: (currentTokens / maxTokens).toFixed(2),
    isOverBudget: currentTokens > maxTokens,
  });

  tracer.logEvent('Render', 'Estimation Calibration', {
    breakdown: env.tokenCalculator.calculateTokenBreakdown(nodes),
  });

  tracer.logEvent('Render', 'Protection Audit', {
    reasons: Object.fromEntries(protectionReasons),
  });

  if (currentTokens <= maxTokens) {
    tracer.logEvent(
      'Render',
      `View is within maxTokens (${currentTokens} <= ${maxTokens}). Returning view.`,
    );

    const allVisibleNodes = nodes;

    const managedNodes =
      lateBindPrompt && lastTurnId
        ? allVisibleNodes.filter((n) => n.turnId !== lastTurnId)
        : allVisibleNodes;

    const pendingNodes =
      lateBindPrompt && lastTurnId
        ? allVisibleNodes.filter((n) => n.turnId === lastTurnId)
        : [];

    const history = env.graphMapper.fromGraph(managedNodes);
    const pendingHistory = env.graphMapper.fromGraph(pendingNodes);

    tracer.logEvent('Render', 'Render Context for LLM', {
      renderedContext: history,
      pendingContext: pendingHistory,
    });

    performCalibration(env, allVisibleNodes, [
      ...history.map((h) => h.content),
      ...pendingHistory.map((h) => h.content),
    ]);

    return {
      history,
      pendingHistory,
      didApplyManagement: false,
      baseUnits:
        advancedTokenCalculator.getRawBaseUnits(allVisibleNodes) +
        headerBaseUnits,
      processedNodes: nodes,
    };
  }
  const targetDelta = currentTokens - sidecar.config.budget.retainedTokens;
  tracer.logEvent(
    'Render',
    `View exceeds maxTokens (${currentTokens} > ${maxTokens}). Hitting Synchronous Pressure Barrier.`,
    { targetDelta },
  );
  debugLogger.log(
    `Context Manager Synchronous Barrier triggered: View at ${currentTokens} tokens (limit: ${maxTokens}).`,
  );

  const agedOutNodes = new Set<string>();
  let rollingTokens = 0;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const priorTokens = rollingTokens;
    const nodeTokens = env.tokenCalculator.calculateConcreteListTokens([node]);
    rollingTokens += nodeTokens;

    if (priorTokens > sidecar.config.budget.retainedTokens) {
      if (sidecar.config.gcStrategy === 'incremental') {
        // Only target enough of the oldest nodes to get back under maxTokens
        // priorTokens represents tokens newer than this node.
        // If the newer tokens alone are enough to push us over maxTokens, we MUST compress this node.
        // If the newer tokens are under maxTokens, we can stop compressing.
        if (priorTokens > maxTokens) {
          agedOutNodes.add(node.id);
        } else if (rollingTokens > maxTokens) {
          // This is the boundary node that pushes us over maxTokens. Compress it.
          agedOutNodes.add(node.id);
        }
      } else {
        agedOutNodes.add(node.id);
      }
    }
  }

  if (lateBindPrompt && lastTurnId) {
    for (const node of nodes) {
      if (node.turnId === lastTurnId) {
        agedOutNodes.delete(node.id);
      }
    }
  }

  const processedBuffer = await orchestrator.executeTriggerSync(
    'gc_backstop',
    ContextWorkingBufferImpl.initialize(nodes),
    agedOutNodes,
    protectedIds,
  );

  const processedNodes = processedBuffer.nodes;

  const skipList = new Set<string>();
  for (const node of processedNodes) {
    if (node.abstractsIds) {
      for (const id of node.abstractsIds) skipList.add(id);
    }
  }

  const allVisibleNodes = processedNodes.filter((n) => !skipList.has(n.id));

  const managedNodes =
    lateBindPrompt && lastTurnId
      ? allVisibleNodes.filter((n) => n.turnId !== lastTurnId)
      : allVisibleNodes;

  const pendingNodes =
    lateBindPrompt && lastTurnId
      ? allVisibleNodes.filter((n) => n.turnId === lastTurnId)
      : [];

  const history = env.graphMapper.fromGraph(managedNodes);
  const pendingHistory = env.graphMapper.fromGraph(pendingNodes);

  const finalTokens =
    advancedTokenCalculator.calculateConcreteListTokens(allVisibleNodes);
  tracer.logEvent('Render', 'Render Sanitized Context for LLM', {
    renderedContextSanitized: history,
    pendingContextSanitized: pendingHistory,
  });
  debugLogger.log(
    `Context Manager finished. Final actual token count: ${finalTokens}.`,
  );

  performCalibration(env, allVisibleNodes, [
    ...history.map((h) => h.content),
    ...pendingHistory.map((h) => h.content),
  ]);

  return {
    history,
    pendingHistory,
    didApplyManagement: true,
    baseUnits:
      advancedTokenCalculator.getRawBaseUnits(allVisibleNodes) +
      headerBaseUnits,
    processedNodes,
  };
}
