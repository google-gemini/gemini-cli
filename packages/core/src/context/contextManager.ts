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
  private lastTriggeredNormalizeDeficit = 0;

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

    // Direct synchronization: ContextManager is the "Pull Master"
    // and tells the orchestrator what to do.
    this.orchestrator.setNodeProvider(() => this.buffer.nodes);

    this.eventBus.onProcessorResult((event) => {
      // Defensive: Verify all targets are still present in the buffer.
      const bufferIds = new Set(this.buffer.nodes.map((n) => n.id));
      if (!event.targets.every((t) => bufferIds.has(t.id))) {
        debugLogger.warn(
          `[ContextManager] Dropping processor result from ${event.processorId}: targets no longer in buffer.`,
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

  async renderHistory(
    pendingRequest?: HistoryTurn,
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
      const syncedNodes = this.env.graphMapper.sync([pendingRequest]);
      const previewNodeIds = new Set(syncedNodes.map((n) => n.id));

      const previewBuffer = ContextWorkingBufferImpl.initialize(syncedNodes);

      const processedPreviewBuffer = await this.orchestrator.executeTriggerSync(
        'new_message',
        previewBuffer,
        previewNodeIds,
      );

      previewNodes = processedPreviewBuffer.nodes;
    }

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

    // 3. Synchronous Pressure Barrier
    await Promise.all([this.orchestrator.waitForPipelines(), hotStartPromise]);

    let nodes = this.buffer.nodes;
    const previewNodeIds = new Set<string>();

    if (previewNodes.length > 0) {
      nodes = [...nodes, ...previewNodes];
      for (const node of previewNodes) {
        previewNodeIds.add(node.id);
      }
    }

    // 4. Trigger Management (GC/Distillation/Normalization)
    await this.evaluateTriggers(nodes, newPrimalNodes, activeTaskIds);

    // Re-fetch nodes from buffer (master) and combine with ephemeral previews
    nodes = [...this.buffer.nodes, ...previewNodes];

    // 5. Final Render
    const header = this.headerProvider
      ? await this.headerProvider()
      : undefined;

    const nodesHash = deriveStableId([
      ...nodes.map((n) => n.id),
      header ? JSON.stringify(header.parts) : 'no-header',
    ]);

    if (this.lastRenderCache?.nodesHash === nodesHash) {
      this.tracer.logEvent('ContextManager', 'Render Cache Hit', { nodesHash });
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
      // Commit the GC backstop results back to the master buffer.
      // We must be careful to only apply results to the nodes that belong to the master buffer.
      const masterIdsInResult = new Set(this.buffer.nodes.map((n) => n.id));
      const processedMasterNodes = processedNodes.filter(
        (n) => !previewNodeIds.has(n.id) || masterIdsInResult.has(n.id),
      );

      this.buffer = this.buffer.applyProcessorResult(
        'sync_backstop',
        this.buffer.nodes,
        processedMasterNodes,
      );
    }

    // Structural validation
    checkContextInvariants(this.buffer.nodes, 'RenderHistory');

    const fullHistoryToHarden = [...renderedHistory, ...pendingHistory];

    const hardenedFullHistory = hardenHistory(fullHistoryToHarden, {
      sentinels: this.sidecar.sentinels,
    });

    const envContextId = deriveStableId(['environment-context']);
    const pendingIds = new Set(pendingHistory.map((t) => t.id));
    const resultHistory: HistoryTurn[] = [];
    const resultPending: HistoryTurn[] = [];

    let foundPending = false;
    for (const turn of hardenedFullHistory) {
      if (
        !foundPending &&
        (pendingIds.has(turn.id) ||
          (turn.id.startsWith('turn_') &&
            pendingIds.has(turn.id.substring(5)))) &&
        turn.id !== envContextId &&
        turn.id !== `turn_${envContextId}`
      ) {
        foundPending = true;
      }

      if (foundPending) {
        resultPending.push(turn);
      } else {
        resultHistory.push(turn);
      }
    }

    const result = {
      history: renderedHistory,
      apiHistory: resultHistory.map((h) => h.content),
      pendingApiHistory: resultPending.map((h) => h.content),
      didApplyManagement,
      baseUnits,
      processedNodes,
    };

    if (header) {
      result.apiHistory.unshift(header);
    }

    this.lastRenderCache = { nodesHash, result };

    this.tracer.logEvent('ContextManager', 'Rendering Complete', {
      historySize: renderedHistory.length,
      pendingSize: pendingHistory.length,
      didApplyManagement,
    });

    return result;
  }

  async waitForPipelines(): Promise<void> {
    await this.orchestrator.waitForPipelines();
  }

  shutdown() {
    this.orchestrator.shutdown();
  }

  getNodes(): readonly ConcreteNode[] {
    return this.buffer.nodes;
  }

  getEnvironment(): ContextEnvironment {
    return this.env;
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

  private async evaluateTriggers(
    nodes: readonly ConcreteNode[],
    newPrimalNodes: ReadonlySet<string>,
    activeTaskIds: Set<string>,
  ) {
    if (newPrimalNodes.size > 0) {
      this.buffer = await this.orchestrator.executeTriggerSync(
        'nodes_added',
        this.buffer,
        newPrimalNodes,
      );
    }

    // Identify ephemeral preview nodes that are NOT in the master buffer.
    const bufferIds = new Set(this.buffer.nodes.map((n) => n.id));
    const previewNodes = nodes.filter((n) => !bufferIds.has(n.id));
    const currentNodes = [...this.buffer.nodes, ...previewNodes];

    const currentTokens =
      this.env.tokenCalculator.calculateConcreteListTokens(currentNodes);

    if (currentTokens > this.sidecar.config.budget.retainedTokens) {
      const agedOutRetainedNodes = new Set<string>();
      const agedOutNormalizedNodes = new Set<string>();

      const protectionMap = this.getProtectedNodeIds(
        currentNodes,
        activeTaskIds,
      );
      const protectedIds = new Set(protectionMap.keys());

      // Also pin Turn 0 (Environment Context)
      const envTurnId = `turn_${deriveStableId(['environment-context'])}`;
      const turn0Nodes = currentNodes.filter((n) => n.turnId === envTurnId);
      for (const n of turn0Nodes) {
        protectedIds.add(n.id);
      }

      let rollingTokens = 0;
      for (let i = currentNodes.length - 1; i >= 0; i--) {
        const node = currentNodes[i];
        const priorTokens = rollingTokens;
        rollingTokens += this.env.tokenCalculator.calculateConcreteListTokens([
          node,
        ]);

        if (priorTokens > this.sidecar.config.budget.retainedTokens) {
          if (!protectedIds.has(node.id)) {
            const hasNormalizedTier =
              this.sidecar.config.budget.normalizedTokens !== undefined;
            if (
              !hasNormalizedTier ||
              priorTokens <= this.sidecar.config.budget.normalizedTokens!
            ) {
              agedOutRetainedNodes.add(node.id);
            }
            if (
              hasNormalizedTier &&
              priorTokens > this.sidecar.config.budget.normalizedTokens!
            ) {
              agedOutNormalizedNodes.add(node.id);
            }
          }
        }
      }

      if (agedOutRetainedNodes.size > 0) {
        const targetDeficit =
          currentTokens - this.sidecar.config.budget.retainedTokens;
        const threshold =
          this.sidecar.config.budget.coalescingThresholdTokens || 0;

        if (targetDeficit < this.lastTriggeredDeficit) {
          this.lastTriggeredDeficit = targetDeficit;
        }

        if (targetDeficit > this.lastTriggeredDeficit + threshold) {
          this.lastTriggeredDeficit = targetDeficit;

          this.eventBus.emitConsolidationNeeded({
            nodes: this.buffer.nodes,
            targetDeficit,
            targetNodeIds: agedOutRetainedNodes,
          });

          this.env.tokenCalculator.garbageCollectCache(
            new Set(this.buffer.nodes.map((n) => n.id)),
          );

          this.buffer = await this.orchestrator.executeTriggerSync(
            'nodes_aged_out',
            this.buffer,
            agedOutRetainedNodes,
            protectedIds,
          );
        }
      } else {
        this.lastTriggeredDeficit = 0;
      }

      if (agedOutNormalizedNodes.size > 0) {
        const targetDeficit =
          currentTokens - this.sidecar.config.budget.normalizedTokens!;
        const threshold =
          this.sidecar.config.budget.coalescingThresholdTokens || 0;

        if (targetDeficit < this.lastTriggeredNormalizeDeficit) {
          this.lastTriggeredNormalizeDeficit = targetDeficit;
        }

        if (targetDeficit > this.lastTriggeredNormalizeDeficit + threshold) {
          this.lastTriggeredNormalizeDeficit = targetDeficit;

          this.eventBus.emitNormalizeNeeded({
            nodes: this.buffer.nodes,
            targetDeficit,
            targetNodeIds: agedOutNormalizedNodes,
          });

          this.buffer = await this.orchestrator.executeTriggerSync(
            'normalized_exceeded',
            this.buffer,
            agedOutNormalizedNodes,
            protectedIds,
          );
        }
      } else {
        this.lastTriggeredNormalizeDeficit = 0;
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

    // Identify Environment Context (Turn 0) for pinning
    const envContextId = deriveStableId(['environment-context']);
    const envContextTurnId = `turn_${envContextId}`;

    for (const node of nodes) {
      if (node.turnId === envContextTurnId || node.turnId === envContextId) {
        protectionMap.set(node.id, 'environment_context');
      }
      if (node.turnId === lastTurnId) {
        protectionMap.set(node.id, 'recent_turn');
      }
    }

    for (const id of extraProtectedIds) {
      protectionMap.set(id, 'external_active_task');
    }

    return protectionMap;
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
}
