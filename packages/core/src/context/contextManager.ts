/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import type { GeminiClient } from '../core/client.js';
import type { ContextAccountingState, ContextProcessor } from './pipeline.js';
import type { AgentChatHistory } from '../core/agentChatHistory.js';
import { debugLogger } from '../utils/debugLogger.js';
import { IrMapper } from './ir/mapper.js';
import type { Episode } from './ir/types.js';

import { ContextEventBus } from './eventBus.js';

export class ContextManager {
  private config: Config;
  private processors: ContextProcessor[] = [];
  
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
      const targetEp = this.pristineEpisodes.find(ep => ep.id === event.targetId);
      if (targetEp) {
        if (!targetEp.variants) {
          targetEp.variants = {};
        }
        targetEp.variants[event.variantId] = event.variant;
        debugLogger.log(`ContextManager: Received async variant [${event.variantId}] for Episode ${event.targetId}.`);
      }
    });
  }

  setProcessors(processors: ContextProcessor[]) {
    this.processors = processors;
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
    const currentTokens = this.calculateIrTokens(this.pristineEpisodes);
    
    // 1. Eager Compute Trigger (Continuous Streaming)
    // Broadcast the full graph to the async workers so they can proactively summarize partial massive files.
    this.eventBus.emitChunkReceived({ episodes: this.pristineEpisodes });

    // 2. The Ship of Theseus Trigger (retainedTokens crossed)
    // If we exceed 65k, tell the background processors to opportunistically synthesize the oldest nodes.
    if (currentTokens > mngConfig.budget.retainedTokens) {
      const deficit = currentTokens - mngConfig.budget.retainedTokens;
      this.eventBus.emitConsolidationNeeded({
        episodes: this.pristineEpisodes,
        targetDeficit: deficit,
      });
    }
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
    const retainedTokens = mngConfig.budget.retainedTokens;
    
    // Default block GC: target the 65k floor instantly.
    let targetTokens = retainedTokens;

    // Deep-ish clone the IR graph so processors only mutate the projected copy.
    // The processors only modify `presentation` and `metadata.transformations`.
    // 1. Opportunistic Swap (The Ship of Theseus)
    // We build the projection array by sweeping through pristine history.
    // If we are over the retained threshold, we look for pre-computed, 'ready' variants 
    // and seamlessly inject them instead of the raw text.
    let currentEpisodes: Episode[] = [];
    let rollingTokens = 0;
    
    // We walk backwards (newest to oldest) to easily know when we cross the retained threshold.
    for (let i = this.pristineEpisodes.length - 1; i >= 0; i--) {
      const ep = this.pristineEpisodes[i];
      let projectedEp = {
        ...ep,
        trigger: { ...ep.trigger, metadata: { ...ep.trigger.metadata, transformations: [...ep.trigger.metadata.transformations] }, semanticParts: ep.trigger.type === 'USER_PROMPT' ? [...ep.trigger.semanticParts.map(sp => ({...sp}))] : undefined } as any,
        steps: ep.steps.map((step) => ({ ...step, metadata: { ...step.metadata, transformations: [...step.metadata.transformations] } } as any)),
        yield: ep.yield ? { ...ep.yield, metadata: { ...ep.yield.metadata, transformations: [...ep.yield.metadata.transformations] } } : undefined,
      };

      const epTokens = this.calculateIrTokens([projectedEp]);
      
      // If this episode falls entirely outside the retained threshold AND has a ready variant, swap it!
      if (rollingTokens > retainedTokens && ep.variants) {
        // Look for the best available variant
        const snapshot = ep.variants['snapshot'];
        const summary = ep.variants['summary'];
        const masked = ep.variants['masked'];

        if (snapshot && snapshot.status === 'ready' && snapshot.type === 'snapshot') {
          // A snapshot replaces this node ENTIRELY (and potentially others, but for now we just swap this node)
          // To be perfectly accurate, a snapshot variant usually replaces multiple episodes.
          // But as a simplistic projection, we just use the snapshot's episode structure.
          projectedEp = snapshot.episode as any;
          debugLogger.log(`Opportunistically swapped Episode ${ep.id} for pre-computed Snapshot variant.`);
        } else if (summary && summary.status === 'ready' && summary.type === 'summary') {
          // A summary replaces all the steps with a single thought containing the summary text.
          projectedEp.steps = [{
            id: ep.id + '-summary',
            type: 'AGENT_THOUGHT',
            text: summary.text,
            metadata: { originalTokens: epTokens, currentTokens: summary.recoveredTokens || 50, transformations: [{ processorName: 'AsyncSemanticCompressor', action: 'SUMMARIZED', timestamp: Date.now() }] }
          }] as any;
          projectedEp.yield = undefined; // Drop the yield, the summary covers it
          debugLogger.log(`Opportunistically swapped Episode ${ep.id} for pre-computed Summary variant.`);
        } else if (masked && masked.status === 'ready' && masked.type === 'masked') {
           // We just replace the raw text with the masked text variant
           if (projectedEp.trigger.type === 'USER_PROMPT' && projectedEp.trigger.semanticParts.length > 0) {
             projectedEp.trigger.semanticParts[0].presentation = { text: masked.text, tokens: masked.recoveredTokens || 10 };
           }
           debugLogger.log(`Opportunistically swapped Episode ${ep.id} for pre-computed Masked variant.`);
        }
      }

      currentEpisodes.unshift(projectedEp); // Put it back in oldest-to-newest order
      rollingTokens += this.calculateIrTokens([projectedEp]);
    }
    
    let currentTokens = this.calculateIrTokens(currentEpisodes);

    if (currentTokens <= maxTokens) {
      return IrMapper.fromIr(currentEpisodes);
    }

    // incrementalGc: instead of instantly dropping from 150k to 65k (block GC),
    // we only prune exactly enough tokens to survive the incoming turn.
    // However, the processors are STILL instructed to squash/compress down to the
    // 65k floor (the "bloom filter" backbuffer). They just stop early once
    // the immediate maxTokens deficit is cleared.
    if (mngConfig.budget.incrementalGc) {
      const immediateDeficit = currentTokens - maxTokens;
      // We set the target just beneath the current ceiling to clear the immediate deficit.
      // This forces the oldest nodes to heavily compress (since they are furthest from the 65k floor),
      // but stops the pipeline as soon as we drop back under 150k.
      targetTokens = currentTokens - immediateDeficit;
    }

    debugLogger.log(
      `Context Manager triggered: Context window at ${currentTokens} tokens (limit: ${maxTokens}, target: ${targetTokens}).`,
    );

    const protectedEpisodeIds = new Set<string>();
    // Protect the very first episode (often contains the initial architectural ask/system prompt)
    if (mngConfig.budget.protectSystemEpisode && currentEpisodes.length > 0) {
      protectedEpisodeIds.add(currentEpisodes[0].id);
    }
    // Protect the most recent episode (current working context)
    if (currentEpisodes.length > 1) {
      protectedEpisodeIds.add(currentEpisodes[currentEpisodes.length - 1].id);
    }

    for (const processor of this.processors) {
      const state: ContextAccountingState = {
        currentTokens,
        maxTokens,
        retainedTokens: targetTokens,
        deficitTokens: Math.max(0, currentTokens - targetTokens),
        protectedEpisodeIds,
        isBudgetSatisfied: currentTokens <= targetTokens,
      };

      if (state.isBudgetSatisfied) {
        debugLogger.log('Context Manager satisfied budget. Stopping early.');
        break;
      }

      debugLogger.log(`Running ContextProcessor: ${processor.name}`);
      currentEpisodes = await processor.process(currentEpisodes, state);
      const newTokens = this.calculateIrTokens(currentEpisodes);

      if (newTokens < currentTokens) {
        debugLogger.log(
          `Processor [${processor.name}] saved approx ${currentTokens - newTokens} tokens. New estimate: ${newTokens}.`,
        );
        currentTokens = newTokens;
      }
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
