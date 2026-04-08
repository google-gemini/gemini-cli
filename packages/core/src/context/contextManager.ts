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
import { PipelineOrchestrator } from './sidecar/orchestrator.js';
import { HistoryObserver } from './historyObserver.js';
import { IrProjector } from './ir/projector.js';
import { registerBuiltInProcessors } from './sidecar/builtins.js';
import { ProcessorRegistry } from './sidecar/registry.js';

export class ContextManager {
  // The stateful, pristine flat graph.
  private pristineShip: ReadonlyArray<ConcreteNode> = [];
  private currentShip: ReadonlyArray<ConcreteNode> = [];
  private readonly eventBus: ContextEventBus;

  // Internal sub-components
  private orchestrator: PipelineOrchestrator;
  private historyObserver?: HistoryObserver;

  static create(
    sidecar: SidecarConfig,
    env: ContextEnvironment,
    tracer: ContextTracer,
    orchestrator?: PipelineOrchestrator,
    registry?: ProcessorRegistry,
  ): ContextManager {
    if (!registry) {
      registry = new ProcessorRegistry();
      registerBuiltInProcessors(registry);
    }
    const orch =
      orchestrator ||
      new PipelineOrchestrator(sidecar, env, env.eventBus, tracer, registry);
    return new ContextManager(sidecar, env, tracer, orch);
  }

  // Use ContextManager.create() instead
  private constructor(
    private sidecar: SidecarConfig,
    private env: ContextEnvironment,
    private readonly tracer: ContextTracer,
    orchestrator: PipelineOrchestrator,
  ) {
    this.eventBus = env.eventBus;
    this.orchestrator = orchestrator;

    this.eventBus.onPristineHistoryUpdated((event) => {
      this.pristineShip = event.ship;
      // In V2, we assume currentShip updates sequentially via Orchestrator patches.
      // But if pristine changes, we must ensure our current view incorporates new nodes.
      // For now, simple fallback: if the current ship doesn't have the new nodes, append them.
      // A more robust implementation would diff the ship, but for now we'll just track.
      const existingIds = new Set(this.currentShip.map((n) => n.id));
      const addedNodes = event.ship.filter((n) => !existingIds.has(n.id));
      if (addedNodes.length > 0) {
         this.currentShip = [...this.currentShip, ...addedNodes];
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
    if (this.historyObserver) {
      this.historyObserver.stop();
    }
  }

  /**
   * Evaluates if the current working buffer exceeds configured budget thresholds,
   * firing consolidation events if necessary.
   */
  private evaluateTriggers(newNodes: Set<string>) {
    if (!this.sidecar.budget) return;

    if (newNodes.size > 0) {
       this.eventBus.emitChunkReceived({
           ship: this.currentShip,
           targetNodeIds: newNodes
       });
    }

    const currentTokens = this.env.tokenCalculator.calculateConcreteListTokens(this.currentShip);

    if (currentTokens > this.sidecar.budget.retainedTokens) {
      const agedOutNodes = new Set<string>();
      let rollingTokens = 0;
      // Walk backwards finding nodes that fall out of the retained budget
      for (let i = this.currentShip.length - 1; i >= 0; i--) {
        const node = this.currentShip[i];
        rollingTokens += node.metadata.currentTokens;
        if (rollingTokens > this.sidecar.budget.retainedTokens) {
          agedOutNodes.add(node.id);
        }
      }

      if (agedOutNodes.size > 0) {
        this.eventBus.emitConsolidationNeeded({
          ship: this.currentShip,
          targetDeficit: currentTokens - this.sidecar.budget.retainedTokens,
          targetNodeIds: agedOutNodes,
        });
      }
    }
  }

  /**
   * Starts tracking the raw agent history and translating it to Episodic IR.
   */
  subscribeToHistory(chatHistory: AgentChatHistory) {
    if (this.historyObserver) {
      this.historyObserver.stop();
    }

    this.historyObserver = new HistoryObserver(
      chatHistory,
      this.eventBus,
      this.tracer,
      this.env.tokenCalculator,
    );
    this.historyObserver.start();
  }

  /**
   * Retrieves the raw, uncompressed Episodic IR graph.
   * Useful for internal tool rendering (like the trace viewer).
   * Note: This is an expensive, deep clone operation.
   */
  getPristineGraph(): ReadonlyArray<ConcreteNode> {
    return [...this.pristineShip];
  }

  /**
   * Generates a virtual view of the pristine graph, substituting in variants
   * up to the configured token budget.
   * This is the view that will eventually be projected back to the LLM.
   */
  getShip(): ReadonlyArray<ConcreteNode> {
    return [...this.currentShip];
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
      this.currentShip,
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
