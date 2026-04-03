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

export class ContextManager {
  private config: Config;
  private processors: ContextProcessor[] = [];
  
  // The stateful, pristine Episodic Intermediate Representation graph.
  // This allows the agent to remember and summarize continuously without losing data across turns.
  private pristineEpisodes: Episode[] = [];
  private unsubscribeHistory?: () => void;

  constructor(config: Config, _client: GeminiClient) {
    this.config = config;
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
    });
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
    let currentEpisodes: Episode[] = this.pristineEpisodes.map((ep) => ({
      ...ep,
      trigger: { ...ep.trigger, metadata: { ...ep.trigger.metadata, transformations: [...ep.trigger.metadata.transformations] }, semanticParts: ep.trigger.type === 'USER_PROMPT' ? [...ep.trigger.semanticParts.map(sp => ({...sp}))] : undefined } as any,
      steps: ep.steps.map((step) => ({ ...step, metadata: { ...step.metadata, transformations: [...step.metadata.transformations] } } as any)),
      yield: ep.yield ? { ...ep.yield, metadata: { ...ep.yield.metadata, transformations: [...ep.yield.metadata.transformations] } } : undefined,
    }));
    
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
