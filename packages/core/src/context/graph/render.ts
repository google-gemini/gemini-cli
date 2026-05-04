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

/**
 * Maps the Episodic Context Graph back into a raw Gemini Content[] array for transmission.
 * It applies synchronous context management (GC backstop) if the budget is exceeded.
 */
export async function render(
  nodes: readonly ConcreteNode[],
  orchestrator: PipelineOrchestrator,
  sidecar: ContextProfile,
  tracer: ContextTracer,
  env: ContextEnvironment,
  protectionReasons: Map<string, string> = new Map(),
  headerTokens: number = 0,
): Promise<{ history: Content[]; didApplyManagement: boolean }> {
  if (!sidecar.config.budget) {
    const contents = env.graphMapper.fromGraph(nodes);
    tracer.logEvent('Render', 'Render Context to LLM (No Budget)', {
      renderedContext: contents,
    });
    return { history: contents, didApplyManagement: false };
  }

  const maxTokens = sidecar.config.budget.maxTokens;
  const graphTokens = env.tokenCalculator.calculateConcreteListTokens(nodes);
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
    const contents = env.graphMapper.fromGraph(nodes);
    tracer.logEvent('Render', 'Render Context for LLM', {
      renderedContext: contents,
    });
    return { history: contents, didApplyManagement: false };
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
    const nodeTokens = env.tokenCalculator.calculateConcreteListTokens([node]);
    rollingTokens += nodeTokens;
    if (rollingTokens > sidecar.config.budget.retainedTokens) {
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

  const visibleNodes = processedNodes.filter((n) => !skipList.has(n.id));

  const contents = env.graphMapper.fromGraph(visibleNodes);
  tracer.logEvent('Render', 'Render Sanitized Context for LLM', {
    renderedContextSanitized: contents,
  });
  return { history: contents, didApplyManagement: true };
}
