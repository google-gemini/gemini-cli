/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { AgentChatHistory, HistoryEvent } from '../core/agentChatHistory.js';
import type { ConcreteNode } from './ir/types.js';
import type { ContextTracer } from './tracer.js';
import type { ContextEnvironment } from './pipeline/environment.js';
import type { ContextProfile } from './config/profiles.js';
import { IrProjector } from './ir/projector.js';
import { ContextWorkingBufferImpl } from './pipeline/contextWorkingBuffer.js';
import type { PipelineDef, AsyncPipelineDef, PipelineTrigger } from './config/types.js';
import { debugLogger } from '../utils/debugLogger.js';

export class ContextManager {
  private buffer: ContextWorkingBufferImpl = ContextWorkingBufferImpl.initialize([]);
  private pristineNodes: readonly ConcreteNode[] = [];
  
  private unsubscribeHistory?: () => void;
  private seenNodeIds = new Set<string>();
  private activeTimers: NodeJS.Timeout[] = [];
  
  private pipelines: PipelineDef[] = [];
  private asyncPipelines: AsyncPipelineDef[] = [];

  constructor(
    private readonly sidecar: ContextProfile,
    private readonly env: ContextEnvironment,
    private readonly tracer: ContextTracer,
    private readonly chatHistory: AgentChatHistory,
  ) {
    this.pipelines = sidecar.buildPipelines(env);
    this.asyncPipelines = sidecar.buildAsyncPipelines(env);
    this.setupTriggers();
    this.startHistoryObserver();
  }

  private startHistoryObserver() {
    this.unsubscribeHistory = this.chatHistory.subscribe((_event: HistoryEvent) => {
      const pristineEpisodes = this.env.irMapper.toIr(
        this.chatHistory.get(),
        this.env.tokenCalculator,
      );

      const nodes: ConcreteNode[] = [];
      for (const ep of pristineEpisodes) {
        if (ep.concreteNodes) {
          for (const child of ep.concreteNodes) {
            nodes.push(child);
          }
        }
      }

      const newNodes = new Set<string>();
      for (const node of nodes) {
        if (!this.seenNodeIds.has(node.id)) {
          newNodes.add(node.id);
          this.seenNodeIds.add(node.id);
        }
      }

      this.tracer.logEvent(
        'ContextManager',
        'Rebuilt pristine graph from chat history update',
        { nodesSize: nodes.length, newNodesCount: newNodes.size },
      );

      this.pristineNodes = nodes;

      const existingIds = new Set(this.buffer.nodes.map((n) => n.id));
      const addedNodes = nodes.filter((n) => !existingIds.has(n.id));

      if (addedNodes.length > 0) {
        this.buffer = this.buffer.appendPristineNodes(addedNodes);
      }

      this.evaluateTriggers(newNodes);
    });
  }

  private setupTriggers() {
    // In V1, background timers were set up here.
    for (const pipeline of this.pipelines) {
      for (const trigger of pipeline.triggers) {
        if (typeof trigger === 'object' && trigger.type === 'timer') {
          const timer = setInterval(() => {}, trigger.intervalMs);
          this.activeTimers.push(timer);
        }
      }
    }
  }

  private evaluateTriggers(newNodes: Set<string>) {
    if (!this.sidecar.config.budget) return;

    if (newNodes.size > 0) {
      this.executeTrigger('new_message', newNodes);
      this.executeTrigger('nodes_added', newNodes);
    }

    const currentTokens = this.env.tokenCalculator.calculateConcreteListTokens(this.buffer.nodes);

    if (currentTokens > this.sidecar.config.budget.retainedTokens) {
      const agedOutNodes = new Set<string>();
      let rollingTokens = 0;
      for (let i = this.buffer.nodes.length - 1; i >= 0; i--) {
        const node = this.buffer.nodes[i];
        rollingTokens += this.env.tokenCalculator.calculateConcreteListTokens([node]);
        if (rollingTokens > this.sidecar.config.budget.retainedTokens) {
          agedOutNodes.add(node.id);
        }
      }

      if (agedOutNodes.size > 0) {
        this.executeTrigger('retained_exceeded', agedOutNodes);
        this.executeTrigger('nodes_aged_out', agedOutNodes);
      }
    }
  }

  private executeTrigger(trigger: PipelineTrigger, targetNodeIds: ReadonlySet<string>) {
    const triggerPipelines = this.pipelines.filter(p => p.triggers.includes(trigger));
    for (const pipeline of triggerPipelines) {
      void this.executePipelineAsync(pipeline, this.buffer.nodes, targetNodeIds, new Set());
    }

    const triggerAsyncPipelines = this.asyncPipelines.filter(p => p.triggers.includes(trigger));
    for (const pipeline of triggerAsyncPipelines) {
      const targets = this.buffer.nodes.filter(n => targetNodeIds.has(n.id));
      for (const processor of pipeline.processors) {
        processor.process({
          targets,
          snapshotCache: this.env.snapshotCache,
          buffer: ContextWorkingBufferImpl.initialize(this.buffer.nodes),
        }).catch(e => debugLogger.error(`AsyncProcessor ${processor.name} failed:`, e));
      }
    }
  }

  async executeTriggerSync(
    trigger: PipelineTrigger,
    nodes: readonly ConcreteNode[],
    triggerTargets: ReadonlySet<string>,
    protectedLogicalIds: ReadonlySet<string> = new Set(),
  ): Promise<readonly ConcreteNode[]> {
    let currentBuffer = ContextWorkingBufferImpl.initialize(nodes);
    const triggerPipelines = this.pipelines.filter((p) => p.triggers.includes(trigger));

    for (const pipeline of triggerPipelines) {
      for (const processor of pipeline.processors) {
        try {
          this.tracer.logEvent('ContextManager', `Executing processor synchronously: ${processor.id}`);

          const allowedTargets = currentBuffer.nodes.filter((n) =>
            this.isNodeAllowed(n, triggerTargets, protectedLogicalIds)
          );

          const returnedNodes = await processor.process({
            buffer: currentBuffer,
            targets: allowedTargets,
            snapshotCache: this.env.snapshotCache,
          });

          currentBuffer = currentBuffer.applyProcessorResult(
            processor.id,
            allowedTargets,
            returnedNodes,
          );
        } catch (error) {
          debugLogger.error(`Synchronous processor ${processor.id} failed:`, error);
        }
      }
    }

    return currentBuffer.nodes;
  }

  private async executePipelineAsync(
    pipeline: PipelineDef,
    nodes: readonly ConcreteNode[],
    triggerTargets: ReadonlySet<string>,
    protectedLogicalIds: ReadonlySet<string> = new Set(),
  ) {
    this.tracer.logEvent('ContextManager', `Triggering async pipeline: ${pipeline.name}`);
    if (!nodes || nodes.length === 0) return;

    let currentBuffer = ContextWorkingBufferImpl.initialize(nodes);

    for (const processor of pipeline.processors) {
      try {
        this.tracer.logEvent('ContextManager', `Executing processor: ${processor.id} (async)`);

        const allowedTargets = currentBuffer.nodes.filter((n) =>
          this.isNodeAllowed(n, triggerTargets, protectedLogicalIds)
        );

        const returnedNodes = await processor.process({
          buffer: currentBuffer,
          targets: allowedTargets,
          snapshotCache: this.env.snapshotCache,
        });

        currentBuffer = currentBuffer.applyProcessorResult(
          processor.id,
          allowedTargets,
          returnedNodes,
        );
      } catch (error) {
        debugLogger.error(`Pipeline ${pipeline.name} failed async at ${processor.id}:`, error);
        return;
      }
    }
    
    // Push the state to buffer
    this.buffer = currentBuffer;
  }

  private isNodeAllowed(
    node: ConcreteNode,
    triggerTargets: ReadonlySet<string>,
    protectedLogicalIds: ReadonlySet<string> = new Set(),
  ): boolean {
    return (
      triggerTargets.has(node.id) &&
      !protectedLogicalIds.has(node.id) &&
      (!node.logicalParentId || !protectedLogicalIds.has(node.logicalParentId))
    );
  }

  shutdown() {
    for (const timer of this.activeTimers) {
      clearInterval(timer);
    }
    if (this.unsubscribeHistory) {
      this.unsubscribeHistory();
      this.unsubscribeHistory = undefined;
    }
  }

  getPristineGraph(): readonly ConcreteNode[] {
    return [...this.pristineNodes];
  }

  getNodes(): readonly ConcreteNode[] {
    return [...this.buffer.nodes];
  }

  async projectCompressedHistory(
    activeTaskIds: Set<string> = new Set(),
  ): Promise<Content[]> {
    this.tracer.logEvent('ContextManager', 'Starting projection to LLM context');
    
    const finalHistory = await IrProjector.project(
      this.buffer.nodes,
      this,
      this.sidecar,
      this.tracer,
      this.env,
      activeTaskIds,
    );

    this.tracer.logEvent('ContextManager', 'Finished projection');

    return finalHistory;
  }
}
