/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { ConcreteNode } from './types.js';
import type { ContextTracer } from '../tracer.js';
import type { ContextProfile } from '../config/profiles.js';
import type { PipelineOrchestrator } from '../pipeline/orchestrator.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { performCalibration } from '../utils/tokenCalibration.js';
import type { AdvancedTokenCalculator } from '../utils/contextTokenCalculator.js';
import type { HistoryTurn } from '../../core/agentChatHistory.js';

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
  protectionReasons: Map<string, string> = new Map(),
  header?: Content,
  previewNodeIds: ReadonlySet<string> = new Set(),
): Promise<{
  history: HistoryTurn[];
  didApplyManagement: boolean;
  baseUnits: number;
  processedNodes: readonly ConcreteNode[];
}> {
  let headerTokens = 0;
  let headerBaseUnits = 0;
  if (header) {
    const costs =
      advancedTokenCalculator.calculateContentTokensAndBaseUnits(header);
    headerTokens = costs.tokens;
    headerBaseUnits = costs.baseUnits;
  }

  if (!sidecar.config.budget) {
    const visibleNodes = nodes.filter((n) => !previewNodeIds.has(n.id));
    const contents = env.graphMapper.fromGraph(visibleNodes);
    tracer.logEvent('Render', 'Render Context to LLM (No Budget)', {
      renderedContext: contents,
    });

    // In all cases, retrieve raw base units from the token calculator interface
    const baseUnits =
      advancedTokenCalculator.getRawBaseUnits(nodes) + headerBaseUnits;

    return {
      history: contents,
      didApplyManagement: false,
      baseUnits,
      processedNodes: nodes,
    };
  }

  const maxTokens = sidecar.config.budget.maxTokens;

  const { tokens: graphTokens, baseUnits: graphBaseUnits } =
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
    const visibleNodes = nodes.filter((n) => !previewNodeIds.has(n.id));
    const contents = env.graphMapper.fromGraph(visibleNodes);
    tracer.logEvent('Render', 'Render Context for LLM', {
      renderedContext: contents,
    });
    performCalibration(
      env,
      visibleNodes,
      contents.map((h) => h.content),
    );
    return {
      history: contents,
      didApplyManagement: false,
      baseUnits: graphBaseUnits + headerBaseUnits,
      processedNodes: nodes,
    };
  }
  const targetDelta = currentTokens - sidecar.config.budget.retainedTokens;
  tracer.logEvent(
    'Render',
    `View exceeds maxTokens (${currentTokens} > ${maxTokens}). Hitting Synchronous Pressure Barrier.`,
    { targetDelta },
  );

  // Calculate exactly which nodes aged out of the retainedTokens budget to form our target delta
  const agedOutNodes = new Set<string>();
  let rollingTokens = 0;
  // Start from newest and count backwards
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const priorTokens = rollingTokens;
    const nodeTokens = env.tokenCalculator.calculateConcreteListTokens([node]);
    rollingTokens += nodeTokens;

    // Loose Boundary Policy: Keep the node that crosses the boundary
    if (priorTokens > sidecar.config.budget.retainedTokens) {
      agedOutNodes.add(node.id);
    }
  }

  const processedNodes = await orchestrator.executeTriggerSync(
    'gc_backstop',
    nodes,
    agedOutNodes,
    protectedIds,
  );

  // Apply skipList logic to abstract over summarized nodes
  const skipList = new Set<string>();
  for (const node of processedNodes) {
    if (node.abstractsIds) {
      for (const id of node.abstractsIds) skipList.add(id);
    }
  }

  const visibleNodes = processedNodes.filter(
    (n) => !skipList.has(n.id) && !previewNodeIds.has(n.id),
  );

  const contents = env.graphMapper.fromGraph(visibleNodes);
  tracer.logEvent('Render', 'Render Sanitized Context for LLM', {
    renderedContextSanitized: contents,
  });
  performCalibration(
    env,
    visibleNodes,
    contents.map((h) => h.content),
  );
  return {
    history: contents,
    didApplyManagement: true,
    baseUnits:
      advancedTokenCalculator.getRawBaseUnits(visibleNodes) + headerBaseUnits,
    processedNodes,
  };
}
