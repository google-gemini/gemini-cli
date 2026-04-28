/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { AgentChatHistory } from '../core/agentChatHistory.js';
import type { ConcreteNode } from './graph/types.js';
import type { ContextEventBus } from './eventBus.js';
import type { ContextTracer } from './tracer.js';
import type { ContextEnvironment } from './pipeline/environment.js';
import type { ContextProfile } from './config/profiles.js';
import type { PipelineOrchestrator } from './pipeline/orchestrator.js';
import { HistoryObserver } from './historyObserver.js';
import { render } from './graph/render.js';
import { ContextWorkingBufferImpl } from './pipeline/contextWorkingBuffer.js';

export class ContextManager {
  // The master state containing the pristine graph and current active graph.
  private buffer: ContextWorkingBufferImpl =
    ContextWorkingBufferImpl.initialize([]);

  private readonly eventBus: ContextEventBus;

  // Internal sub-components
  private readonly orchestrator: PipelineOrchestrator;
  private readonly historyObserver: HistoryObserver;

  constructor(
    private readonly sidecar: ContextProfile,
    private readonly env: ContextEnvironment,
    private readonly tracer: ContextTracer,
    orchestrator: PipelineOrchestrator,
    chatHistory: AgentChatHistory,
  ) {
    this.eventBus = env.eventBus;
    this.orchestrator = orchestrator;

    this.historyObserver = new HistoryObserver(
      chatHistory,
      this.env.eventBus,
      this.tracer,
      this.env.tokenCalculator,
      this.env.graphMapper,
    );

    this.eventBus.onPristineHistoryUpdated((event) => {
      const newIds = new Set(event.nodes.map((n) => n.id));
      const addedNodes = event.nodes.filter((n) => event.newNodes.has(n.id));

      // Prune any pristine nodes that were dropped from the upstream history
      this.buffer = this.buffer.prunePristineNodes(newIds);

      if (addedNodes.length > 0) {
        this.buffer = this.buffer.appendPristineNodes(addedNodes);
      }

      this.evaluateTriggers(event.newNodes);
    });
    this.eventBus.onProcessorResult((event) => {
      this.buffer = this.buffer.applyProcessorResult(
        event.processorId,
        event.targets,
        event.returnedNodes,
      );
    });

    this.historyObserver.start();
  }

  /**
   * Safely stops background async pipelines and clears event listeners.
   */
  shutdown() {
    this.orchestrator.shutdown();
    this.historyObserver.stop();
  }

  /**
   * Evaluates if the current working buffer exceeds configured budget thresholds,
   * firing consolidation events if necessary.
   */
  private evaluateTriggers(newNodes: Set<string>) {
    if (!this.sidecar.config.budget) return;

    if (newNodes.size > 0) {
      this.eventBus.emitChunkReceived({
        nodes: this.buffer.nodes,
        targetNodeIds: newNodes,
      });
    }

    const currentTokens = this.env.tokenCalculator.calculateConcreteListTokens(
      this.buffer.nodes,
    );

    if (currentTokens > this.sidecar.config.budget.retainedTokens) {
      const agedOutNodes = new Set<string>();
      let rollingTokens = 0;
      // Walk backwards finding nodes that fall out of the retained budget
      for (let i = this.buffer.nodes.length - 1; i >= 0; i--) {
        const node = this.buffer.nodes[i];
        rollingTokens += this.env.tokenCalculator.calculateConcreteListTokens([
          node,
        ]);
        if (rollingTokens > this.sidecar.config.budget.retainedTokens) {
          agedOutNodes.add(node.id);
        }
      }

      if (agedOutNodes.size > 0) {
        this.env.tokenCalculator.garbageCollectCache(
          new Set(this.buffer.nodes.map((n) => n.id)),
        );
        this.eventBus.emitConsolidationNeeded({
          nodes: this.buffer.nodes,
          targetDeficit:
            currentTokens - this.sidecar.config.budget.retainedTokens,
          targetNodeIds: agedOutNodes,
        });
      }
    }
  }

  /**
   * Retrieves the raw, uncompressed Episodic Context Graph graph.
   * Useful for internal tool rendering (like the trace viewer).
   * Note: This is an expensive, deep clone operation.
   */
  getPristineGraph(): readonly ConcreteNode[] {
    const pristineSet = new Map<string, ConcreteNode>();
    for (const node of this.buffer.nodes) {
      const roots = this.buffer.getPristineNodes(node.id);
      for (const root of roots) {
        pristineSet.set(root.id, root);
      }
    }
    // We sort them by timestamp to ensure they are returned in chronological order
    return Array.from(pristineSet.values()).sort(
      (a, b) => a.timestamp - b.timestamp,
    );
  }

  /**
   * Generates a virtual view of the pristine graph, substituting in variants
   * up to the configured token budget.
   * This is the view that will eventually be projected back to the LLM.
   */
  getNodes(): readonly ConcreteNode[] {
    return [...this.buffer.nodes];
  }

  /**
   * Executes the final 'gc_backstop' pipeline if necessary, enforcing the token budget,
   * and maps the Episodic Context Graph back into a raw Gemini Content[] array for transmission.
   * This is the primary method called by the agent framework before sending a request.
   */
  async renderHistory(
    activeTaskIds: Set<string> = new Set(),
  ): Promise<Content[]> {
    this.tracer.logEvent('ContextManager', 'Starting rendering of LLM context');

    // Apply final GC Backstop pressure barrier synchronously before mapping
    const finalHistory = await render(
      this.buffer.nodes,
      this.orchestrator,
      this.sidecar,
      this.tracer,
      this.env,
      activeTaskIds,
    );

    this.tracer.logEvent('ContextManager', 'Finished rendering');

    return finalHistory;
  }
}
