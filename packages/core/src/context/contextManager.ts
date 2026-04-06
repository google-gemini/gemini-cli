/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from '@google/genai';

import type { AgentChatHistory } from '../core/agentChatHistory.js';
import { debugLogger } from '../utils/debugLogger.js';
import { IrMapper } from './ir/mapper.js';
import type { Episode } from './ir/types.js';

import { ContextEventBus } from './eventBus.js';
import { ContextTracer } from './tracer.js';

import { StateSnapshotWorker } from './workers/stateSnapshotWorker.js';

import type { ContextEnvironment } from './sidecar/environment.js';

import type { SidecarConfig } from './sidecar/types.js';
import { ProcessorRegistry } from './sidecar/registry.js';
import type { ContextProcessor } from './pipeline.js';
import type { AsyncContextWorker } from './workers/asyncContextWorker.js';

import { ToolMaskingProcessor } from './processors/toolMaskingProcessor.js';
import { BlobDegradationProcessor } from './processors/blobDegradationProcessor.js';
import { SemanticCompressionProcessor } from './processors/semanticCompressionProcessor.js';
import { HistorySquashingProcessor } from './processors/historySquashingProcessor.js';

export class ContextManager {
  // The stateful, pristine Episodic Intermediate Representation graph.
  // This allows the agent to remember and summarize continuously without losing data across turns.
  private pristineEpisodes: Episode[] = [];
  private unsubscribeHistory?: () => void;
  private readonly eventBus: ContextEventBus;

  // Internal sub-components
  // Synchronous processors are instantiated but effectively used as singletons within this class
  private workers: AsyncContextWorker[] = [];

  constructor(
    private sidecar: SidecarConfig,
    private env: ContextEnvironment,
    private readonly tracer: ContextTracer,
  ) {
    this.eventBus = new ContextEventBus();

    // Register built-ins
    ProcessorRegistry.register({
      id: 'ToolMaskingProcessor',
      create: (env, opts) => new ToolMaskingProcessor(env, opts as any),
    });
    ProcessorRegistry.register({
      id: 'BlobDegradationProcessor',
      create: (env, opts) => new BlobDegradationProcessor(env),
    });
    ProcessorRegistry.register({
      id: 'SemanticCompressionProcessor',
      create: (env, opts) => new SemanticCompressionProcessor(env, opts as any),
    });
    ProcessorRegistry.register({
      id: 'HistorySquashingProcessor',
      create: (env, opts) => new HistorySquashingProcessor(env, opts as any),
    });
    ProcessorRegistry.register({
      id: 'StateSnapshotWorker',
      create: (env, opts) => new StateSnapshotWorker(env),
    });

    this.eventBus.onVariantReady((event) => {
      // Find the target episode in the pristine graph
      const targetEp = this.pristineEpisodes.find(
        (ep) => ep.id === event.targetId,
      );
      if (targetEp) {
        if (!targetEp.variants) {
          targetEp.variants = {};
        }
        targetEp.variants[event.variantId] = event.variant;
        this.tracer.logEvent(
          'ContextManager',
          `Received async variant [${event.variantId}] for Episode ${event.targetId}`,
        );
        debugLogger.log(
          `ContextManager: Received async variant [${event.variantId}] for Episode ${event.targetId}.`,
        );
      }
    });

    // Initialize synchronous fallback processors
    // Order matters: Fast, lossless masking -> Intelligent degradation -> Brutal truncation fallback

    // Initialize and start background subconscious workers
    for (const bgDef of this.sidecar.pipelines.eagerBackground) {
      const worker = ProcessorRegistry.get(bgDef.processorId).create(
        this.env,
        bgDef.options,
      ) as AsyncContextWorker;
      worker.start(this.eventBus);
      this.workers.push(worker);
    }
  }

  /**
   * Safely stops background workers and clears event listeners.
   */
  shutdown() {
    for (const worker of this.workers) {
      worker.stop();
    }
    if (this.unsubscribeHistory) {
      this.unsubscribeHistory();
    }
  }

  /**
   * Subscribes to the core AgentChatHistory to natively track all message events,
   * converting them seamlessly into pristine Episodes.
   */
  subscribeToHistory(chatHistory: AgentChatHistory) {
    if (this.unsubscribeHistory) {
      this.unsubscribeHistory();
    }

    this.unsubscribeHistory = chatHistory.subscribe((event) => {
      // Rebuild the pristine IR graph from the full source history on every change.
      // We must map the FULL array at once because IrMapper groups adjacent
      // function calls and responses into unified Episodes. Pushing messages
      // individually would shatter these episodic boundaries.
      this.pristineEpisodes = IrMapper.toIr(chatHistory.get());
      this.tracer.logEvent(
        'ContextManager',
        'Rebuilt pristine graph from chat history update',
        { episodeCount: this.pristineEpisodes.length },
      );
      this.checkTriggers();
    });
  }

  private checkTriggers() {
    if (!this.sidecar.budget) return;

    const mngConfig = this.sidecar;

    // Calculate tokens based on the *Working Buffer View*, not the raw pristine log.
    // This solves Bug 2: The View shrinks when variants are applied, preventing infinite GC loops.
    const workingBuffer = this.getWorkingBufferView();
    const currentTokens = this.calculateIrTokens(workingBuffer);

    this.tracer.logEvent('ContextManager', 'Evaluated triggers', {
      currentTokens,
      retainedTokens: mngConfig.budget.retainedTokens,
    });

    // 1. Eager Compute Trigger (Continuous Streaming)
    // Broadcast the full pristine log to the async workers so they can proactively summarize partial massive files.
    this.eventBus.emitChunkReceived({ episodes: this.pristineEpisodes });

    // 2. The Ship of Theseus Trigger (retainedTokens crossed)
    // If we exceed 65k, tell the background processors to opportunistically synthesize the oldest nodes.
    if (currentTokens > mngConfig.budget.retainedTokens) {
      const deficit = currentTokens - mngConfig.budget.retainedTokens;
      this.tracer.logEvent(
        'ContextManager',
        'Budget crossed. Emitting ConsolidationNeeded',
        { deficit },
      );
      console.log(
        'EMITTING CONSOLIDATION. Buffer:',
        workingBuffer.length,
        'Deficit:',
        deficit,
      );
      this.eventBus.emitConsolidationNeeded({
        episodes: workingBuffer, // Pass the working buffer so they know what still needs compression
        targetDeficit: deficit,
      });
    }
  }

  /**
   * Generates a computed view of the pristine log.
   * Sweeps backwards (newest to oldest), tracking rolling tokens.
   * When rollingTokens > retainedTokens, it injects the "best" available ready variant
   * (snapshot > summary > masked) instead of the raw text.
   * Handles N-to-1 variant skipping automatically.
   */
  /**
   * Applies the data-driven Sidecar configuration graphs.
   * Splits the episodes into the 'retained' and 'normal' ranges,
   * runs their respective processor pipelines sequentially, and recombines them.
   */
  private async applyProcessorGraphs(episodes: Episode[]): Promise<Episode[]> {
    const mngConfig = this.sidecar;
    const retainedLimit = mngConfig.budget.retainedTokens;

    // If we're incredibly small, maybe we just run the retained graph on everything?
    // Let's divide the episodes exactly at the retained boundary.
    const retainedWindow: Episode[] = [];
    const normalWindow: Episode[] = [];
    let rollingTokens = 0;

    // Scan backwards to fill the retained window
    for (let i = episodes.length - 1; i >= 0; i--) {
      const ep = episodes[i];
      const epTokens = this.calculateIrTokens([ep]);
      if (
        (rollingTokens + epTokens <= retainedLimit &&
          normalWindow.length === 0) ||
        retainedWindow.length === 0
      ) {
        // We always put at least the latest episode in the retained window.
        // We only add to retainedWindow if we haven't already started the normalWindow (contiguous block).
        retainedWindow.unshift(ep);
        rollingTokens += epTokens;
      } else {
        normalWindow.unshift(ep);
      }
    }

    const protectedIds = new Set<string>();
    // We must protect the System Episode, which is always index 0 of pristineEpisodes.
    if (this.pristineEpisodes.length > 0) {
      protectedIds.add(this.pristineEpisodes[0].id); // Structural invariant
    }

    const createAccountingState = (currentTotal: number) => ({
      currentTokens: currentTotal,
      maxTokens: mngConfig.budget.maxTokens,
      retainedTokens: mngConfig.budget.retainedTokens,
      deficitTokens: Math.max(0, currentTotal - mngConfig.budget.maxTokens),
      protectedEpisodeIds: protectedIds,
      isBudgetSatisfied: currentTotal <= mngConfig.budget.maxTokens, // We use maxTokens here so processors don't prematurely short-circuit if they are trying to prevent a barrier hit
    });

    // Run Retained Graph
    let processedRetained = [...retainedWindow];
    for (const def of mngConfig.pipelines.retainedProcessingGraph) {
      const processor = ProcessorRegistry.get(def.processorId).create(
        this.env,
        def.options,
      ) as ContextProcessor;
      this.tracer.logEvent(
        'ContextManager',
        `Running ${processor.name} on retained window.`,
      );
      const state = createAccountingState(
        this.calculateIrTokens([...normalWindow, ...processedRetained]),
      );
      processedRetained = await processor.process(processedRetained, state);
    }

    // Run Normal Graph
    let processedNormal = [...normalWindow];
    for (const def of mngConfig.pipelines.normalProcessingGraph) {
      const processor = ProcessorRegistry.get(def.processorId).create(
        this.env,
        def.options,
      ) as ContextProcessor;
      this.tracer.logEvent(
        'ContextManager',
        `Running ${processor.name} on normal window.`,
      );
      const state = createAccountingState(
        this.calculateIrTokens([...processedNormal, ...processedRetained]),
      );
      processedNormal = await processor.process(processedNormal, state);
    }

    return [...processedNormal, ...processedRetained];
  }

  public getWorkingBufferView(): Episode[] {
    const mngConfig = this.sidecar;
    const retainedTokens = mngConfig.budget.retainedTokens;

    let currentEpisodes: Episode[] = [];
    let rollingTokens = 0;
    const skippedIds = new Set<string>();
    this.tracer.logEvent('ViewGenerator', 'Generating Working Buffer View');

    for (let i = this.pristineEpisodes.length - 1; i >= 0; i--) {
      const ep = this.pristineEpisodes[i];

      // If this episode was already replaced by an N-to-1 Snapshot injected earlier in the sweep, skip it entirely!
      // This solves Bug 1 (Duplicate Projection).
      if (skippedIds.has(ep.id)) {
        this.tracer.logEvent(
          'ViewGenerator',
          `Skipping episode [${ep.id}] due to N-to-1 replacement.`,
        );
        continue;
      }

      let projectedEp = {
        ...ep,
        trigger: {
          ...ep.trigger,
          metadata: {
            ...ep.trigger.metadata,
            transformations: [...ep.trigger.metadata.transformations],
          },
          semanticParts:
            ep.trigger.type === 'USER_PROMPT'
              ? [...ep.trigger.semanticParts.map((sp) => ({ ...sp }))]
              : undefined,
        } as any,
        steps: ep.steps.map(
          (step) =>
            ({
              ...step,
              metadata: {
                ...step.metadata,
                transformations: [...step.metadata.transformations],
              },
            }) as any,
        ),
        yield: ep.yield
          ? {
              ...ep.yield,
              metadata: {
                ...ep.yield.metadata,
                transformations: [...ep.yield.metadata.transformations],
              },
            }
          : undefined,
      };

      const epTokens = this.calculateIrTokens([projectedEp]);

      if (ep.variants) {
        console.log(
          'Checking variants for',
          ep.id,
          'rollingTokens:',
          rollingTokens,
          'retained:',
          retainedTokens,
        );
      }
      if (rollingTokens > retainedTokens && ep.variants) {
        console.log('EVALUATING VARIANTS FOR', ep.id);
        const snapshot = ep.variants['snapshot'];
        const summary = ep.variants['summary'];
        const masked = ep.variants['masked'];

        if (
          snapshot &&
          snapshot.status === 'ready' &&
          snapshot.type === 'snapshot'
        ) {
          projectedEp = snapshot.episode as any;
          // Mark all the episodes this snapshot covers to be skipped by the backwards sweep.
          for (const id of snapshot.replacedEpisodeIds) {
            skippedIds.add(id);
          }
          this.tracer.logEvent(
            'ViewGenerator',
            `Episode [${ep.id}] has SnapshotVariant. Selecting variant over raw text. Added [${snapshot.replacedEpisodeIds.join(',')}] to skippedIds.`,
          );
          debugLogger.log(
            `Opportunistically swapped Episodes [${snapshot.replacedEpisodeIds.join(', ')}] for pre-computed Snapshot variant.`,
          );
        } else if (
          summary &&
          summary.status === 'ready' &&
          summary.type === 'summary'
        ) {
          projectedEp.steps = [
            {
              id: ep.id + '-summary',
              type: 'AGENT_THOUGHT',
              text: summary.text,
              metadata: {
                originalTokens: epTokens,
                currentTokens: summary.recoveredTokens || 50,
                transformations: [
                  {
                    processorName: 'AsyncSemanticCompressor',
                    action: 'SUMMARIZED',
                    timestamp: Date.now(),
                  },
                ],
              },
            },
          ] as any;
          projectedEp.yield = undefined;
          this.tracer.logEvent(
            'ViewGenerator',
            `Episode [${ep.id}] has SummaryVariant. Selecting variant over raw text.`,
          );
          debugLogger.log(
            `Opportunistically swapped Episode ${ep.id} for pre-computed Summary variant.`,
          );
        } else if (
          masked &&
          masked.status === 'ready' &&
          masked.type === 'masked'
        ) {
          if (
            projectedEp.trigger.type === 'USER_PROMPT' &&
            projectedEp.trigger.semanticParts.length > 0
          ) {
            projectedEp.trigger.semanticParts[0].presentation = {
              text: masked.text,
              tokens: masked.recoveredTokens || 10,
            };
          }
          this.tracer.logEvent(
            'ViewGenerator',
            `Episode [${ep.id}] has MaskedVariant. Selecting variant over raw text.`,
          );
          debugLogger.log(
            `Opportunistically swapped Episode ${ep.id} for pre-computed Masked variant.`,
          );
        }
      }

      currentEpisodes.unshift(projectedEp);
      rollingTokens += this.calculateIrTokens([projectedEp]);
    }

    return currentEpisodes;
  }

  /**
   * Returns a temporary, compressed Content[] array to be used exclusively for the LLM request.
   * This does NOT mutate the pristine episodic graph.
   */
  async projectCompressedHistory(): Promise<Content[]> {
    if (!this.sidecar.budget) {
      return this._projectAndDump(IrMapper.fromIr(this.pristineEpisodes));
    }

    const mngConfig = this.sidecar;
    const maxTokens = mngConfig.budget.maxTokens;
    this.tracer.logEvent('ContextManager', 'Projection requested.');

    // Get the dynamically computed Working Buffer View
    let currentEpisodes = this.getWorkingBufferView();

    currentEpisodes = await this.applyProcessorGraphs(currentEpisodes);

    let currentTokens = this.calculateIrTokens(currentEpisodes);

    if (currentTokens <= maxTokens) {
      this.tracer.logEvent(
        'ContextManager',
        `View is within maxTokens (${currentTokens} <= ${maxTokens}). Returning view.`,
      );
      return this._projectAndDump(IrMapper.fromIr(currentEpisodes));
    }

    this.tracer.logEvent(
      'ContextManager',
      `View exceeds maxTokens (${currentTokens} > ${maxTokens}). Hitting Synchronous Pressure Barrier. Strategy: ${mngConfig.gcBackstop.strategy}`,
    );
    // --- The Synchronous Pressure Barrier ---
    // The background eager workers couldn't keep up, or a massive file was pasted.
    // The Working Buffer View is still over the absolute hard limit (maxTokens).
    // We MUST reduce tokens before returning, or the API request will 400.

    debugLogger.log(
      `Context Manager Synchronous Barrier triggered: View at ${currentTokens} tokens (limit: ${maxTokens}). Strategy: ${mngConfig.gcBackstop.strategy}`,
    );

    // Calculate target based on gcTarget
    let targetTokens = maxTokens;

    if (mngConfig.gcBackstop.target === 'max') {
      targetTokens = mngConfig.budget.retainedTokens;
    } else if (mngConfig.gcBackstop.target === 'freeNTokens') {
      targetTokens =
        maxTokens - (mngConfig.gcBackstop.freeTokensTarget ?? 10000);
    }

    // Structural invariant: We ALWAYS protect the architectural initialization turn (Turn 0)
    // We do NOT arbitrarily protect recent episodes (like currentEpisodes.length - 1)
    // because an episode can be unboundedly large, and protecting it would crash the LLM.
    const protectedEpisodeId =
      this.pristineEpisodes.length > 0 ? this.pristineEpisodes[0].id : null;

    let remainingTokens = currentTokens;

    const truncated: Episode[] = [];

    const strategy = mngConfig.gcBackstop.strategy;

    for (const ep of currentEpisodes) {
      const epTokens = this.calculateIrTokens([ep]);
      if (remainingTokens > targetTokens && ep.id !== protectedEpisodeId) {
        console.log(
          'DROPPING EPISODE:',
          ep.id,
          'rem:',
          remainingTokens,
          'tgt:',
          targetTokens,
        );

        remainingTokens -= epTokens;
        if (strategy === 'truncate') {
          this.tracer.logEvent('Barrier', `Truncating episode [${ep.id}].`);

          debugLogger.log(`Barrier (truncate): Dropped Episode ${ep.id}`);
        } else if (strategy === 'compress') {
          this.tracer.logEvent(
            'Barrier',
            `Compress fallback to truncate for [${ep.id}].`,
          );
          debugLogger.warn(
            `Synchronous compress barrier not fully implemented, truncating Episode ${ep.id}.`,
          );
        } else if (strategy === 'rollingSummarizer') {
          this.tracer.logEvent(
            'Barrier',
            `RollingSummarizer fallback to truncate for [${ep.id}].`,
          );
          debugLogger.warn(
            `Synchronous rollingSummarizer barrier not fully implemented, truncating Episode ${ep.id}.`,
          );
        }
      } else {
        console.log(
          'KEEPING EPISODE:',
          ep.id,
          'rem:',
          remainingTokens,
          'tgt:',
          targetTokens,
        );
        truncated.push(ep);
      }
    }
    currentEpisodes = truncated;

    const finalTokens = this.calculateIrTokens(currentEpisodes);
    this.tracer.logEvent(
      'ContextManager',
      `Finished projection. Final token count: ${finalTokens}.`,
    );
    debugLogger.log(
      `Context Manager finished. Final actual token count: ${finalTokens}.`,
    );

    return this._projectAndDump(IrMapper.fromIr(currentEpisodes));
  }

  private async _projectAndDump(contents: Content[]): Promise<Content[]> {
    if (process.env['GEMINI_DUMP_CONTEXT'] === 'true') {
      try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const dumpPath = path.join(
          this.env.getTraceDir(),
          '.gemini',
          'projected_context.json',
        );
        await fs.mkdir(path.dirname(dumpPath), { recursive: true });
        await fs.writeFile(
          dumpPath,
          JSON.stringify(contents, null, 2),
          'utf-8',
        );
        debugLogger.log(
          `[Observability] Context successfully dumped to ${dumpPath}`,
        );
      } catch (e) {
        debugLogger.error(`Failed to dump context: ${e}`);
      }
    }
    return contents;
  }

  private calculateIrTokens(episodes: Episode[]): number {
    let tokens = 0;
    for (const ep of episodes) {
      if (ep.trigger) tokens += ep.trigger.metadata.currentTokens;
      for (const step of ep.steps) {
        tokens += step.metadata.currentTokens;
      }
      if (ep.yield) tokens += ep.yield.metadata.currentTokens;
    }
    return tokens;
  }
}
