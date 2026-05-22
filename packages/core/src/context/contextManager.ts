/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type {
  AgentChatHistory,
  HistoryTurn,
} from '../core/agentChatHistory.js';
import type { ConcreteNode } from './graph/types.js';
import type { ContextEventBus } from './eventBus.js';
import type { ContextTracer } from './tracer.js';
import type { ContextEnvironment } from './pipeline/environment.js';
import type { ContextProfile } from './config/profiles.js';
import type { PipelineOrchestrator } from './pipeline/orchestrator.js';
import { render } from './graph/render.js';
import { ContextWorkingBufferImpl } from './pipeline/contextWorkingBuffer.js';
import { debugLogger } from '../utils/debugLogger.js';
import { deriveStableId } from '../utils/cryptoUtils.js';
import { hardenHistory } from '../utils/historyHardening.js';
import { checkContextInvariants } from './utils/invariantChecker.js';
import type { AdvancedTokenCalculator } from './utils/contextTokenCalculator.js';

export class ContextManager {
  // Master state containing the pristine graph and current active graph.
  private buffer: ContextWorkingBufferImpl =
    ContextWorkingBufferImpl.initialize([]);

  private readonly eventBus: ContextEventBus;
  private readonly orchestrator: PipelineOrchestrator;

  // Track what IDs have been evaluated for triggers to prevent redundant processing
  private readonly evaluatedNodeIds = new Set<string>();

  // Hysteresis tracking to prevent utility call churn
  private lastTriggeredDeficit = 0;

  // Cache for Anomaly 3 (Redundant Renders)
  private lastRenderCache?: {
    nodesHash: string;
    result: {
      history: HistoryTurn[];
      apiHistory: Content[];
      pendingApiHistory: Content[];
      didApplyManagement: boolean;
      baseUnits: number;
      processedNodes: readonly ConcreteNode[];
    };
  };

  private hasPerformedHotStart = false;

  constructor(
    private readonly sidecar: ContextProfile,
    private readonly env: ContextEnvironment,
    private readonly tracer: ContextTracer,
    orchestrator: PipelineOrchestrator,
    private readonly chatHistory: AgentChatHistory,
    private readonly advancedTokenCalculator: AdvancedTokenCalculator,
    private readonly headerProvider?: () => Promise<Content | undefined>,
  ) {
    this.eventBus = env.eventBus;
    this.orchestrator = orchestrator;

    // Provide the orchestrator with a way to fetch the latest nodes from the live buffer
    this.orchestrator.setNodeProvider(() => this.buffer.nodes);

    this.eventBus.onProcessorResult((event) => {
      // Defensive: Verify all targets are still present in the buffer.
      const currentIds = new Set(this.buffer.nodes.map((n) => n.id));
      const allTargetsPresent = event.targets.every((t) =>
        currentIds.has(t.id),
      );

      if (!allTargetsPresent) {
        debugLogger.log(
          `[ContextManager] Dropping stale processor result from ${event.processorId}. One or more targets were already removed.`,
        );
        return;
      }

      this.buffer = this.buffer.applyProcessorResult(
        event.processorId,
        event.targets,
        event.returnedNodes,
      );
    });
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
  }

  /**
   * Evaluates if the current working buffer exceeds configured budget thresholds,
   * firing consolidation events if necessary.
   */
  private async evaluateTriggers(newNodes: Set<string>) {
    if (!this.sidecar.config.budget) return;

    if (newNodes.size > 0) {
      await this.orchestrator.executeTriggerSync(
        'new_message',
        this.buffer.nodes,
        newNodes,
      );
    }

    const currentTokens = this.env.tokenCalculator.calculateConcreteListTokens(
      this.buffer.nodes,
    );

    if (currentTokens > this.sidecar.config.budget.retainedTokens) {
      const agedOutNodes = new Set<string>();
      let rollingTokens = 0;

      // Identify nodes that must NEVER be truncated
      const protectedIds = this.getProtectedNodeIds(this.buffer.nodes);

      // Walk backwards finding nodes that fall out of the retained budget
      for (let i = this.buffer.nodes.length - 1; i >= 0; i--) {
        const node = this.buffer.nodes[i];
        const priorTokens = rollingTokens;
        rollingTokens += this.env.tokenCalculator.calculateConcreteListTokens([
          node,
        ]);

        if (priorTokens > this.sidecar.config.budget.retainedTokens) {
          if (!protectedIds.has(node.id)) {
            agedOutNodes.add(node.id);
          }
        }
      }

      if (agedOutNodes.size > 0) {
        const targetDeficit =
          currentTokens - this.sidecar.config.budget.retainedTokens;

        if (targetDeficit < this.lastTriggeredDeficit) {
          this.lastTriggeredDeficit = targetDeficit;
        }

        const threshold =
          this.sidecar.config.budget.coalescingThresholdTokens || 0;
        const growthSinceLast = targetDeficit - this.lastTriggeredDeficit;

        if (
          targetDeficit >= threshold &&
          (growthSinceLast >= threshold || this.lastTriggeredDeficit === 0)
        ) {
          this.lastTriggeredDeficit = targetDeficit;
          this.env.tokenCalculator.garbageCollectCache(
            new Set(this.buffer.nodes.map((n) => n.id)),
          );

          // Trigger synchronous consolidation for budget deficit
          await this.orchestrator.executeTriggerSync(
            'nodes_aged_out',
            this.buffer.nodes,
            agedOutNodes,
            new Set(protectedIds.keys()),
          );
        }
      } else {
        this.lastTriggeredDeficit = 0;
      }
    }
  }

  private getProtectedNodeIds(
    nodes: readonly ConcreteNode[],
    extraProtectedIds: Set<string> = new Set(),
  ): Map<string, string> {
    const protectionMap = new Map<string, string>();
    if (nodes.length === 0) return protectionMap;

    const lastNode = nodes[nodes.length - 1];
    const lastTurnId = lastNode.turnId;
    const envTurnId = `turn_${deriveStableId(['environment-context'])}`;

    for (const node of nodes) {
      if (node.turnId === lastTurnId) {
        protectionMap.set(node.id, 'recent_turn');
      } else if (node.turnId === envTurnId) {
        protectionMap.set(node.id, 'environment_context');
      }
    }

    for (const id of extraProtectedIds) {
      protectionMap.set(id, 'external_active_task');
    }

    return protectionMap;
  }

  getPristineGraph(): readonly ConcreteNode[] {
    const pristineSet = new Map<string, ConcreteNode>();
    for (const node of this.buffer.nodes) {
      const roots = this.buffer.getPristineNodes(node.id);
      for (const root of roots) {
        pristineSet.set(root.id, root);
      }
    }
    return Array.from(pristineSet.values()).sort(
      (a, b) => a.timestamp - b.timestamp,
    );
  }

  getNodes(): readonly ConcreteNode[] {
    return [...this.buffer.nodes];
  }

  /**
   * Generates a virtual view of the pristine graph, substituting in variants
   * up to the configured token budget.
   */
  async renderHistory(
    pendingRequest?: { id: string; content: Content },
    activeTaskIds: Set<string> = new Set(),
    abortSignal?: AbortSignal,
  ): Promise<{
    history: HistoryTurn[];
    apiHistory: Content[];
    pendingApiHistory: Content[];
    didApplyManagement: boolean;
    baseUnits: number;
    processedNodes: readonly ConcreteNode[];
  }> {
    this.tracer.logEvent('ContextManager', 'Starting rendering of LLM context');

    // 1. Explicit Sync with the durable history.
    // This replaces the background HistoryObserver.
    const currentHistory = this.chatHistory.get();
    const pristineNodes = this.env.graphMapper.sync(currentHistory);

    this.buffer = this.buffer.syncPristineHistory(pristineNodes);

    // Identify truly "new" nodes that haven't been evaluated for triggers yet.
    const newPrimalNodes = new Set<string>();
    for (const node of pristineNodes) {
      if (!this.evaluatedNodeIds.has(node.id)) {
        newPrimalNodes.add(node.id);
        this.evaluatedNodeIds.add(node.id);
      }
    }

    // 2. Preview the pending request.
    let previewNodes: readonly ConcreteNode[] = [];
    if (pendingRequest) {
      previewNodes = this.env.graphMapper.sync([pendingRequest]);

      const previewNodeIds = new Set(previewNodes.map((n) => n.id));

      previewNodes = await this.orchestrator.executeTriggerSync(
        'new_message',
        previewNodes,
        previewNodeIds,
      );
    }

    // 3. Trigger evaluation (Sync budget management).
    await this.evaluateTriggers(newPrimalNodes);

    // --- Hot Start Calibration ---
    const hotStartPromise = (async () => {
      if (!this.hasPerformedHotStart) {
        this.hasPerformedHotStart = true;
        if (this.buffer.nodes.length > 0) {
          const nodesForHotStart = [...this.buffer.nodes, ...previewNodes];
          await this.performHotStartCalibration(nodesForHotStart, abortSignal);
        }
      }
    })();

    await Promise.all([this.orchestrator.waitForPipelines(), hotStartPromise]);

    let nodes = this.buffer.nodes;
    const previewNodeIds = new Set<string>();

    if (previewNodes.length > 0) {
      for (const n of previewNodes) {
        previewNodeIds.add(n.id);
      }
      nodes = [...nodes, ...previewNodes];
    }

    const header = this.headerProvider
      ? await this.headerProvider()
      : undefined;

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

    const renderResult = await render(
      nodes,
      this.orchestrator,
      this.sidecar,
      this.tracer,
      this.env,
      this.advancedTokenCalculator,
      {
        protectionReasons,
        header,
        lateBindPrompt: !!pendingRequest,
      },
    );

    const {
      history: renderedHistory,
      pendingHistory,
      didApplyManagement,
      baseUnits,
      processedNodes,
    } = renderResult;

    if (didApplyManagement) {
      this.buffer = this.buffer.applyProcessorResult(
        'sync_backstop',
        this.buffer.nodes,
        processedNodes.filter((n) => !previewNodeIds.has(n.id)),
      );
    }

    checkContextInvariants(this.buffer.nodes, 'RenderHistory');

    this.tracer.logEvent('ContextManager', 'Finished rendering');

    const allHistory = [...renderedHistory, ...pendingHistory];
    const hardenedAllHistory = hardenHistory(allHistory, {
      sentinels: this.sidecar.sentinels,
    });

    const firstPendingId = pendingHistory[0]?.id;
    let splitIndex = renderedHistory.length;
    if (firstPendingId) {
      const foundIndex = hardenedAllHistory.findIndex(
        (h) => h.id === firstPendingId,
      );
      if (foundIndex !== -1) {
        splitIndex = foundIndex;
      }
    }

    const apiHistory = hardenedAllHistory
      .slice(0, splitIndex)
      .map((h) => h.content);

    const pendingApiHistory = hardenedAllHistory
      .slice(splitIndex)
      .map((h) => h.content);

    if (header) {
      apiHistory.unshift(header);
    }

    const result = {
      history: renderedHistory,
      apiHistory,
      pendingApiHistory,
      didApplyManagement,
      baseUnits,
      processedNodes,
    };

    this.lastRenderCache = {
      nodesHash: totalHash,
      result,
    };

    return result;
  }

  private async performHotStartCalibration(
    nodes: readonly ConcreteNode[],
    abortSignal?: AbortSignal,
  ) {
    const history = this.env.graphMapper.fromGraph(nodes);
    const contents = history.map((h) => h.content);

    try {
      const { totalTokens } = await this.env.llmClient.countTokens({
        modelConfigKey: { model: 'context-calibrator' },
        contents,
        abortSignal,
      });

      if (totalTokens !== undefined) {
        this.env.eventBus.emitTokenGroundTruth({
          actualTokens: totalTokens,
          promptBaseUnits: this.advancedTokenCalculator.getRawBaseUnits(nodes),
        });
      }
    } catch (e) {
      debugLogger.warn('[ContextManager] Hot start calibration failed', e);
    }
  }

  getEnvironment(): ContextEnvironment {
    return this.env;
  }
}
