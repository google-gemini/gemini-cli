/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { AgentChatHistory } from '../core/agentChatHistory.js';
import { isToolExecution, type ConcreteNode } from './graph/types.js';
import type { ContextEventBus } from './eventBus.js';
import type { ContextTracer } from './tracer.js';
import type { ContextEnvironment } from './pipeline/environment.js';
import type { ContextProfile } from './config/profiles.js';
import type { PipelineOrchestrator } from './pipeline/orchestrator.js';
import { HistoryObserver } from './historyObserver.js';
import { render } from './graph/render.js';
import { ContextWorkingBufferImpl } from './pipeline/contextWorkingBuffer.js';
import { debugLogger } from '../utils/debugLogger.js';
import { hardenHistory } from '../utils/historyHardening.js';
import { checkContextInvariants } from './utils/invariantChecker.js';

export class ContextManager {
  // The master state containing the pristine graph and current active graph.
  private buffer: ContextWorkingBufferImpl =
    ContextWorkingBufferImpl.initialize([]);

  private readonly eventBus: ContextEventBus;

  // Internal sub-components
  private readonly orchestrator: PipelineOrchestrator;
  private readonly historyObserver: HistoryObserver;

  // Cache for Anomaly 3 (Redundant Renders)
  private lastRenderCache?: {
    nodesHash: string;
    result: { history: Content[]; didApplyManagement: boolean };
  };

  constructor(
    private readonly sidecar: ContextProfile,
    private readonly env: ContextEnvironment,
    private readonly tracer: ContextTracer,
    orchestrator: PipelineOrchestrator,
    chatHistory: AgentChatHistory,
    private readonly headerProvider?: () => Promise<Content | undefined>,
  ) {
    this.eventBus = env.eventBus;
    this.orchestrator = orchestrator;

    // Provide the orchestrator with a way to fetch the latest nodes from the live buffer
    this.orchestrator.setNodeProvider(() => this.buffer.nodes);

    this.historyObserver = new HistoryObserver(
      chatHistory,
      this.env.eventBus,
      this.tracer,
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
   * Returns a promise that resolves when all currently executing async pipelines have finished.
   */
  async waitForPipelines(): Promise<void> {
    return this.orchestrator.waitForPipelines();
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

      // Identify active tool calls that must NEVER be truncated
      const protectedIds = this.getProtectedNodeIds(this.buffer.nodes);
      if (protectedIds.size > 0) {
        debugLogger.log(
          `[ContextManager] Pinning ${protectedIds.size} active tool call nodes to prevent truncation.`,
        );
      }

      // Walk backwards finding nodes that fall out of the retained budget
      for (let i = this.buffer.nodes.length - 1; i >= 0; i--) {
        const node = this.buffer.nodes[i];
        rollingTokens += this.env.tokenCalculator.calculateConcreteListTokens([
          node,
        ]);
        if (rollingTokens > this.sidecar.config.budget.retainedTokens) {
          // Only age out if not protected
          if (!protectedIds.has(node.id)) {
            agedOutNodes.add(node.id);
          }
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
   * Identifies 'pinned' nodes that should not be truncated.
   * This includes:
   * 1. The entire last turn (Recent context).
   * 2. Active tool calls (calls without responses in the graph).
   */
  private getProtectedNodeIds(
    nodes: readonly ConcreteNode[],
    extraProtectedIds: Set<string> = new Set(),
  ): Map<string, string> {
    const protectionMap = new Map<string, string>();
    if (nodes.length === 0) return protectionMap;

    // 1. Identify all nodes belonging to the last turn (Recent context)
    const lastNode = nodes[nodes.length - 1];
    const lastTurnId = lastNode.turnId;

    for (const node of nodes) {
      if (node.turnId === lastTurnId) {
        protectionMap.set(node.id, 'recent_turn');
      }
    }

    // 2. Identify active tool calls that must NEVER be truncated
    const calls = nodes.filter((n) => isToolExecution(n) && n.role === 'model');
    const responses = new Set(
      nodes
        .filter((n) => isToolExecution(n) && n.role === 'user')
        .map((n) => n.payload.functionResponse?.id)
        .filter((id): id is string => !!id),
    );

    for (const call of calls) {
      const id = call.payload.functionCall?.id;
      // If we have a call but no response in the current graph, it's 'in flight'
      if (id && !responses.has(id)) {
        protectionMap.set(call.id, 'in_flight_tool_call');
      }
    }

    // 3. Any externally requested protections
    for (const id of extraProtectedIds) {
      protectionMap.set(id, 'external_active_task');
    }

    return protectionMap;
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
    pendingRequest?: Content,
    activeTaskIds: Set<string> = new Set(),
  ): Promise<{ history: Content[]; didApplyManagement: boolean }> {
    this.tracer.logEvent('ContextManager', 'Starting rendering of LLM context');

    // 1. Synchronous Pressure Barrier: Wait for background management pipelines to finish.
    // This ensures that the render sees the results of recent pushes (Anomaly 2).
    await this.orchestrator.waitForPipelines();

    let nodes = this.buffer.nodes;

    // If we have a pending request, we need to build a 'preview' graph for this render.
    if (pendingRequest) {
      const previewNodes = this.env.graphMapper.applyEvent({
        type: 'PUSH',
        payload: [pendingRequest],
      });
      nodes = [...nodes, ...previewNodes];
    }

    // 2. Fetch Header and calculate tokens
    const header = this.headerProvider
      ? await this.headerProvider()
      : undefined;
    const headerTokens = header
      ? this.env.tokenCalculator.calculateContentTokens(header)
      : 0;

    // 3. Cache Check (Anomaly 3): If nodes haven't changed, return previous result.
    // We combine the graph hash with a hash of the header to ensure total freshness.
    const graphHash = nodes.map((n) => n.id).join('|');
    const headerHash = header ? JSON.stringify(header.parts) : 'no-header';
    const totalHash = `${graphHash}::${headerHash}`;

    if (this.lastRenderCache?.nodesHash === totalHash) {
      debugLogger.log(
        '[ContextManager] Render cache hit. Skipping redundant render.',
      );
      return this.lastRenderCache.result;
    }

    const protectionReasons = this.getProtectedNodeIds(nodes, activeTaskIds);

    // Apply final GC Backstop pressure barrier synchronously before mapping
    const { history: renderedHistory, didApplyManagement } = await render(
      nodes,
      this.orchestrator,
      this.sidecar,
      this.tracer,
      this.env,
      protectionReasons,
      headerTokens,
    );

    // Structural validation in debug mode
    checkContextInvariants(this.buffer.nodes, 'RenderHistory');

    this.tracer.logEvent('ContextManager', 'Finished rendering');

    const combinedHistory = header
      ? [header, ...renderedHistory]
      : renderedHistory;

    const result = {
      history: hardenHistory(combinedHistory, {
        sentinels: this.sidecar.sentinels,
      }),
      didApplyManagement,
    };

    // Update cache
    this.lastRenderCache = { nodesHash: totalHash, result };
    return result;
  }
}
