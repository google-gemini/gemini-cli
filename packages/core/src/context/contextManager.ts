/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import type { GeminiClient } from '../core/client.js';
import type { ContextProcessor } from './pipeline.js';
import type { AgentChatHistory } from '../core/agentChatHistory.js';
import { debugLogger } from '../utils/debugLogger.js';
import { IrMapper } from './ir/mapper.js';
import type { Episode } from './ir/types.js';

import { ContextEventBus } from './eventBus.js';

export class ContextManager {
  private config: Config;
  
  // The stateful, pristine Episodic Intermediate Representation graph.
  // This allows the agent to remember and summarize continuously without losing data across turns.
  private pristineEpisodes: Episode[] = [];
  private unsubscribeHistory?: () => void;
  public readonly eventBus: ContextEventBus;

  constructor(config: Config, _client: GeminiClient) {
    this.config = config;
    this.eventBus = new ContextEventBus();

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
        debugLogger.log(
          `ContextManager: Received async variant [${event.variantId}] for Episode ${event.targetId}.`,
        );
      }
    });
  }

  setProcessors(processors: ContextProcessor[]) {
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
      this.checkTriggers(); // Eager Compute & Ship of Theseus Triggers
    });
  }

  private checkTriggers() {
    if (!this.config.isContextManagementEnabled()) return;

    const mngConfig = this.config.getContextManagementConfig();
    
    // Calculate tokens based on the *Working Buffer View*, not the raw pristine log.
    // This solves Bug 2: The View shrinks when variants are applied, preventing infinite GC loops.
    const workingBuffer = this.getWorkingBufferView();
    const currentTokens = this.calculateIrTokens(workingBuffer);

    // 1. Eager Compute Trigger (Continuous Streaming)
    // Broadcast the full pristine log to the async workers so they can proactively summarize partial massive files.
    this.eventBus.emitChunkReceived({ episodes: this.pristineEpisodes });

    // 2. The Ship of Theseus Trigger (retainedTokens crossed)
    // If we exceed 65k, tell the background processors to opportunistically synthesize the oldest nodes.
    if (currentTokens > mngConfig.budget.retainedTokens) {
      const deficit = currentTokens - mngConfig.budget.retainedTokens;
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
  public getWorkingBufferView(): Episode[] {
    const mngConfig = this.config.getContextManagementConfig();
    const retainedTokens = mngConfig.budget.retainedTokens;
    
    let currentEpisodes: Episode[] = [];
    let rollingTokens = 0;
    const skippedIds = new Set<string>();

    for (let i = this.pristineEpisodes.length - 1; i >= 0; i--) {
      const ep = this.pristineEpisodes[i];
      
      // If this episode was already replaced by an N-to-1 Snapshot injected earlier in the sweep, skip it entirely!
      // This solves Bug 1 (Duplicate Projection).
      if (skippedIds.has(ep.id)) continue;

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

      if (rollingTokens > retainedTokens && ep.variants) {
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
    if (!this.config.isContextManagementEnabled()) {
      return IrMapper.fromIr(this.pristineEpisodes);
    }

    const mngConfig = this.config.getContextManagementConfig();
    const maxTokens = mngConfig.budget.maxTokens;

    // Get the dynamically computed Working Buffer View
    let currentEpisodes = this.getWorkingBufferView();
    let currentTokens = this.calculateIrTokens(currentEpisodes);

    if (currentTokens <= maxTokens) {
      return IrMapper.fromIr(currentEpisodes);
    }

    // --- The Synchronous Pressure Barrier ---
    // The background eager workers couldn't keep up, or a massive file was pasted.
    // The Working Buffer View is still over the absolute hard limit (maxTokens).
    // We MUST reduce tokens before returning, or the API request will 400.
    
    debugLogger.log(
      `Context Manager Synchronous Barrier triggered: View at ${currentTokens} tokens (limit: ${maxTokens}). Strategy: ${mngConfig.budget.maxPressureStrategy}`,
    );

    const protectedEpisodeIds = new Set<string>();
    if (mngConfig.budget.protectSystemEpisode && currentEpisodes.length > 0) {
      protectedEpisodeIds.add(currentEpisodes[0].id);
    }
    if (currentEpisodes.length > 1) {
      protectedEpisodeIds.add(currentEpisodes[currentEpisodes.length - 1].id);
    }

    if (mngConfig.budget.maxPressureStrategy === 'truncate') {
      // Simplest, fastest fallback. Drop oldest unprotected episodes until under maxTokens.
      const truncated: Episode[] = [];
      let remainingTokens = currentTokens;
      for (const ep of currentEpisodes) {
        const epTokens = this.calculateIrTokens([ep]);
        if (remainingTokens > maxTokens && !protectedEpisodeIds.has(ep.id)) {
           remainingTokens -= epTokens;
           debugLogger.log(`Barrier (truncate): Dropped Episode ${ep.id}`);
        } else {
           truncated.push(ep);
        }
      }
      currentEpisodes = truncated;
    } else if (mngConfig.budget.maxPressureStrategy === 'compress') {
      // TODO: Synchronously invoke the StateSnapshotWorker, wait for it to finish, 
      // merge the variants, and regenerate the View.
      // For now, if compress fails/isn't wired synchronously, we fallback to truncate.
      debugLogger.warn('Synchronous compress barrier not fully implemented, falling back to truncate.');
      
      const truncated: Episode[] = [];
      let remainingTokens = currentTokens;
      for (const ep of currentEpisodes) {
        const epTokens = this.calculateIrTokens([ep]);
        if (remainingTokens > maxTokens && !protectedEpisodeIds.has(ep.id)) {
           remainingTokens -= epTokens;
        } else {
           truncated.push(ep);
        }
      }
      currentEpisodes = truncated;
    }

    const finalTokens = this.calculateIrTokens(currentEpisodes);
    debugLogger.log(
      `Context Manager finished. Final actual token count: ${finalTokens}.`,
    );

    return IrMapper.fromIr(currentEpisodes);
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
