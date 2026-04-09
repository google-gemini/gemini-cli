/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { AgentChatHistory } from '../core/agentChatHistory.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { ConcreteNode } from './ir/types.js';
import type { ContextEventBus } from './eventBus.js';
import type { ContextTracer } from './tracer.js';
import type { ContextEnvironment } from './sidecar/environment.js';
import type { SidecarConfig } from './sidecar/types.js';
import type { PipelineOrchestrator } from './sidecar/orchestrator.js';
import { HistoryObserver } from './historyObserver.js';
import { IrProjector } from './ir/projector.js';

export class ContextManager {
  // The stateful, pristine flat graph.
  private pristineNodes: readonly ConcreteNode[] = [];
  private currentNodes: readonly ConcreteNode[] = [];
  private readonly eventBus: ContextEventBus;

  // Internal sub-components
  private readonly orchestrator: PipelineOrchestrator;
  private readonly historyObserver: HistoryObserver;

  constructor(
    private readonly sidecar: SidecarConfig,
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
      this.env.irMapper,
    );
    this.historyObserver.start();

    this.eventBus.onPristineHistoryUpdated((event) => {
      this.pristineNodes = event.nodes;
      // In V2, we assume currentNodes updates sequentially via Orchestrator patches.
      // But if pristine changes, we must ensure our current view incorporates new nodes.
      // For now, simple fallback: if the current nodes doesn't have the new nodes, append them.
      // A more robust implementation would diff the nodes, but for now we'll just track.
      const existingIds = new Set(this.currentNodes.map((n) => n.id));
      const addedNodes = event.nodes.filter((n) => !existingIds.has(n.id));
      if (addedNodes.length > 0) {
         this.currentNodes = [...this.currentNodes, ...addedNodes];
      }

      this.evaluateTriggers(event.newNodes);
    });

    this.eventBus.onVariantReady((event) => {
      // In V2, async workers write back patches. 
      // The old variant dict logic is replaced by the orchestrator applying patches directly.
      // For now we log it.
      this.tracer.logEvent(
        'ContextManager',
        `Received async variant [${event.variantId}] for Node ${event.targetId}`,
      );
      debugLogger.log(
        `ContextManager: Received async variant [${event.variantId}] for Node ${event.targetId}.`,
      );
    });
  }

  /**
   * Safely stops background workers and clears event listeners.
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
    if (!this.sidecar.budget) return;

    if (newNodes.size > 0) {
       this.eventBus.emitChunkReceived({
           nodes: this.currentNodes,
           targetNodeIds: newNodes
       });
    }

    const currentTokens = this.env.tokenCalculator.calculateConcreteListTokens(this.currentNodes);

    if (currentTokens > this.sidecar.budget.retainedTokens) {
      const agedOutNodes = new Set<string>();
      let rollingTokens = 0;
      // Walk backwards finding nodes that fall out of the retained budget
      for (let i = this.currentNodes.length - 1; i >= 0; i--) {
        const node = this.currentNodes[i];
        rollingTokens += this.env.tokenCalculator.calculateConcreteListTokens([node]);
        if (rollingTokens > this.sidecar.budget.retainedTokens) {
          agedOutNodes.add(node.id);
        }
      }

      if (agedOutNodes.size > 0) {
        this.eventBus.emitConsolidationNeeded({
          nodes: this.currentNodes,
          targetDeficit: currentTokens - this.sidecar.budget.retainedTokens,
          targetNodeIds: agedOutNodes,
        });
      }
    }
  }

  /**
   * Retrieves the raw, uncompressed Episodic IR graph.
   * Useful for internal tool rendering (like the trace viewer).
   * Note: This is an expensive, deep clone operation.
   */
  getPristineGraph(): readonly ConcreteNode[] {
    return [...this.pristineNodes];
  }

  /**
   * Generates a virtual view of the pristine graph, substituting in variants
   * up to the configured token budget.
   * This is the view that will eventually be projected back to the LLM.
   */
  getNodes(): readonly ConcreteNode[] {
    return [...this.currentNodes];
  }

  /**
   * Executes the final 'gc_backstop' pipeline if necessary, enforcing the token budget,
   * and maps the Episodic IR back into a raw Gemini Content[] array for transmission.
   * This is the primary method called by the agent framework before sending a request.
   */
  async projectCompressedHistory(
    activeTaskIds: Set<string> = new Set(),
  ): Promise<Content[]> {
    this.tracer.logEvent(
      'ContextManager',
      'Starting projection to LLM context',
    );
    // Apply final GC Backstop pressure barrier synchronously before mapping
    const finalHistory = await IrProjector.project(
      this.currentNodes,
      this.orchestrator,
      this.sidecar,
      this.tracer,
      this.env,
      activeTaskIds,
    );

    this.tracer.logEvent('ContextManager', 'Finished projection');

    return finalHistory;
  }
}
