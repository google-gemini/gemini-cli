/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { ConcreteNode } from './types.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type {
  ContextEnvironment,
  ContextTracer,
} from '../pipeline/environment.js';
import type { PipelineOrchestrator } from '../pipeline/orchestrator.js';
import type { ContextProfile } from '../config/profiles.js';

/**
 * Orchestrates the final render: takes a working buffer view (The Nodes),
 * applies the Immediate Sanitization pipeline, and enforces token boundaries.
 */
export async function render(
  nodes: readonly ConcreteNode[],
  orchestrator: PipelineOrchestrator,
  sidecar: ContextProfile,
  tracer: ContextTracer,
  env: ContextEnvironment,
  protectionReasons: Map<string, string>,
): Promise<Content[]> {
  const protectedIds = new Set(protectionReasons.keys());

  if (!sidecar.config.budget) {
    const contents = env.graphMapper.fromGraph(nodes);
    tracer.logEvent('Render', 'Render Context to LLM (No Budget)', {
      renderedContext: contents,
    });
    return contents;
  }

  const maxTokens = sidecar.config.budget.maxTokens;
  const currentTokens = env.tokenCalculator.calculateConcreteListTokens(nodes);

  // V0: Always protect the first node (System Prompt) and the last turn
  if (nodes.length > 0) {
    const systemPrompt = nodes[0];
    protectedIds.add(systemPrompt.id);
    protectionReasons.set(systemPrompt.id, 'system_prompt');
    if (systemPrompt.logicalParentId) {
      protectedIds.add(systemPrompt.logicalParentId);
      protectionReasons.set(
        systemPrompt.logicalParentId,
        'system_prompt_parent',
      );
    }

    const lastNode = nodes[nodes.length - 1];
    protectedIds.add(lastNode.id);
    protectionReasons.set(lastNode.id, 'recent_turn');
    if (lastNode.logicalParentId) {
      protectedIds.add(lastNode.logicalParentId);
      protectionReasons.set(lastNode.logicalParentId, 'recent_turn_parent');
    }
  }

  tracer.logEvent('Render', 'Budget Audit', {
    maxTokens,
    retainedTokens: sidecar.config.budget.retainedTokens,
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
    return contents;
  }

  const targetDelta = currentTokens - sidecar.config.budget.retainedTokens;
  tracer.logEvent(
    'Render',
    `View exceeds maxTokens (${currentTokens} > ${maxTokens}). Hitting Synchronous Pressure Barrier.`,
    { targetDelta },
  );
  debugLogger.log(
    `Context Manager Synchronous Barrier triggered: View at ${currentTokens} tokens (limit: ${maxTokens}, target reduction: ${targetDelta}).`,
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

  const finalTokens =
    env.tokenCalculator.calculateConcreteListTokens(processedNodes);
  tracer.logEvent(
    'Render',
    `Finished rendering. Final token count: ${finalTokens}.`,
    {
      finalTokens,
      finalBreakdown:
        env.tokenCalculator.calculateTokenBreakdown(processedNodes),
    },
  );
  debugLogger.log(
    `Context Manager finished. Final actual token count: ${finalTokens}.`,
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
  return contents;
}
