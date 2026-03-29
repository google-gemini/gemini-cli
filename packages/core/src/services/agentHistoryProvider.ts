/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import { getResponseText } from '../utils/partUtils.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface AgentHistoryProviderConfig {
  truncationThreshold: number;
  retainedMessages: number;
}

export class AgentHistoryProvider {
  constructor(
    private readonly config: Config,
    private readonly providerConfig: AgentHistoryProviderConfig,
  ) {}

  /**
   * Evaluates the chat history and performs truncation and summarization if necessary.
   * Returns a new array of Content if truncation occurred, otherwise returns the original array.
   */
  async manageHistory(
    history: readonly Content[],
    abortSignal?: AbortSignal,
  ): Promise<readonly Content[]> {
    if (!this.shouldTruncate(history)) {
      return history;
    }

    const { messagesToKeep, messagesToTruncate } =
      this.splitHistoryForTruncation(history);

    debugLogger.log(
      `AgentHistoryProvider: Truncating ${messagesToTruncate.length} messages, retaining ${messagesToKeep.length} messages.`,
    );

    const summaryText = await this.getSummaryText(
      messagesToTruncate,
      abortSignal,
    );

    return this.mergeSummaryWithHistory(summaryText, messagesToKeep);
  }

  private shouldTruncate(history: readonly Content[]): boolean {
    if (!this.config.isExperimentalAgentHistoryTruncationEnabled()) {
      return false;
    }
    return history.length > this.providerConfig.truncationThreshold;
  }

  private splitHistoryForTruncation(history: readonly Content[]): {
    messagesToKeep: readonly Content[];
    messagesToTruncate: readonly Content[];
  } {
    return {
      messagesToKeep: history.slice(-this.providerConfig.retainedMessages),
      messagesToTruncate: history.slice(
        0,
        history.length - this.providerConfig.retainedMessages,
      ),
    };
  }

  private getFallbackSummaryText(
    messagesToTruncate: readonly Content[],
  ): string {
    const defaultNote =
      'System Note: Prior conversation history was truncated to maintain performance and focus. Important context should have been saved to memory.';

    let lastUserText = '';
    for (let i = messagesToTruncate.length - 1; i >= 0; i--) {
      const msg = messagesToTruncate[i];
      if (msg.role === 'user') {
        lastUserText =
          msg.parts
            ?.map((p) => p.text || '')
            .join('')
            .trim() || '';
        if (lastUserText) {
          break;
        }
      }
    }

    if (lastUserText) {
      return `[System Note: Prior conversation history was truncated. The most recent user message before truncation was:]\n\n${lastUserText}`;
    }

    return defaultNote;
  }

  private async getSummaryText(
    messagesToTruncate: readonly Content[],
    abortSignal?: AbortSignal,
  ): Promise<string> {
    if (!this.config.isExperimentalAgentHistorySummarizationEnabled()) {
      debugLogger.log(
        'AgentHistoryProvider: Summarization disabled, using fallback note.',
      );
      return this.getFallbackSummaryText(messagesToTruncate);
    }

    try {
      const summary = await this.generateIntentSummary(
        messagesToTruncate,
        abortSignal,
      );
      debugLogger.log('AgentHistoryProvider: Summarization successful.');
      return summary;
    } catch (error) {
      debugLogger.log('AgentHistoryProvider: Summarization failed.', error);
      return this.getFallbackSummaryText(messagesToTruncate);
    }
  }

  private mergeSummaryWithHistory(
    summaryText: string,
    messagesToKeep: readonly Content[],
  ): readonly Content[] {
    if (messagesToKeep.length === 0) {
      return [{ role: 'user', parts: [{ text: summaryText }] }];
    }

    // To ensure strict user/model alternating roles required by the Gemini API,
    // we merge the summary into the first retained message if it's from the 'user'.
    const firstRetainedMessage = messagesToKeep[0];
    if (firstRetainedMessage.role === 'user') {
      const mergedParts = [
        { text: summaryText },
        ...(firstRetainedMessage.parts || []),
      ];
      const mergedMessage: Content = {
        role: 'user',
        parts: mergedParts,
      };
      return [mergedMessage, ...messagesToKeep.slice(1)];
    } else {
      const summaryMessage: Content = {
        role: 'user',
        parts: [{ text: summaryText }],
      };
      return [summaryMessage, ...messagesToKeep];
    }
  }

  private async generateIntentSummary(
    messagesToTruncate: readonly Content[],
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const prompt = `Create a succinct, agent-continuity focused intent summary of the truncated conversation history.
Distill the essence of the ongoing work by capturing:
- The Original Mandate: What the user (or calling agent) originally requested and why.
- The Agent's Strategy: How you (the agent) are approaching the task and where the work is taking place (e.g., specific files, directories, or architectural layers).
- Evolving Context: Any significant shifts in the user's intent or the agent's technical approach over the course of the truncated history.

Write this summary to orient the active agent. Do NOT predict next steps or summarize the current task state, as those are covered by the active history. Focus purely on foundational context and strategic continuity.`;

    const summaryResponse = await this.config
      .getBaseLlmClient()
      .generateContent({
        modelConfigKey: { model: 'agent-history-provider-summarizer' },
        contents: [
          ...messagesToTruncate,
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        promptId: 'agent-history-provider',
        abortSignal: abortSignal ?? new AbortController().signal,
        role: LlmRole.UTILITY_COMPRESSOR,
      });

    let summary = getResponseText(summaryResponse) ?? '';
    summary = summary.replace(/<\/?intent_summary>/g, '').trim();
    return `<intent_summary>\n${summary}\n</intent_summary>`;
  }
}
