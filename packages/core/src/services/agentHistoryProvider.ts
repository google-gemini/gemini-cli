/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import { getResponseText } from '../utils/partUtils.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { AgentHistoryProviderConfig } from './types.js';
import type { Config } from '../config/config.js';

export const CHARS_PER_TOKEN_ESTIMATE = 4;
export const MIN_TARGET_TOKENS = 10;
export const MIN_CHARS_FOR_TRUNCATION = 100;
export const TEXT_TRUNCATION_PREFIX =
  '[Message Normalized: Exceeded size limit]';
export const TOOL_TRUNCATION_PREFIX =
  '[Message Normalized: Tool output exceeded size limit]';

/**
 * Truncates a string to a target length, keeping a proportional amount of the head and tail,
 * and prepending a prefix.
 */
export function truncateProportionally(
  str: string,
  targetChars: number,
  prefix: string,
  headRatio: number = 0.2,
): string {
  if (str.length <= targetChars) return str;

  const ellipsis = '\n...\n';
  const overhead = prefix.length + ellipsis.length + 1; // +1 for the newline after prefix
  const availableChars = Math.max(0, targetChars - overhead);

  if (availableChars <= 0) {
    return prefix; // Safe fallback if target is extremely small
  }

  const headChars = Math.floor(availableChars * headRatio);
  const tailChars = availableChars - headChars;

  return `${prefix}\n${str.substring(0, headChars)}${ellipsis}${str.substring(str.length - tailChars)}`;
}

export class AgentHistoryProvider {
  // TODO(joshualitt): just pass the BaseLlmClient instead of the whole Config.
  constructor(
    private readonly providerConfig: AgentHistoryProviderConfig,
    private readonly config: Config,
  ) {}

  /**
   * Evaluates the chat history and performs truncation and summarization if necessary.
   * Returns a new array of Content if truncation occurred, otherwise returns the original array.
   */
  async manageHistory(
    history: readonly Content[],
    abortSignal?: AbortSignal,
  ): Promise<readonly Content[]> {
    if (!this.providerConfig.isTruncationEnabled) {
      return history;
    }

    // Step 1: Pre-process the history to enforce normalization across all messages
    const normalizedHistory = this.enforceMessageSizeLimits(history);

    // Step 2: Check if truncation is needed based on the threshold
    if (normalizedHistory.length <= this.providerConfig.truncationThreshold) {
      return normalizedHistory;
    }

    // Step 3: Split into keep/truncate boundaries
    const { messagesToKeep, messagesToTruncate } =
      this.splitHistoryForTruncation(normalizedHistory);

    if (messagesToTruncate.length === 0) {
      return messagesToKeep;
    }

    debugLogger.log(
      `AgentHistoryProvider: Truncating ${messagesToTruncate.length} messages, retaining ${messagesToKeep.length} messages.`,
    );

    const summaryText = await this.getSummaryText(
      messagesToTruncate,
      abortSignal,
    );

    return this.mergeSummaryWithHistory(summaryText, messagesToKeep);
  }

  /**
   * Enforces message size limits across the entire history.
   * - Messages within the "grace period" (recent messages) have a high MAXIMUM limit.
   * - Messages outside the grace period (older messages) are restricted to the NORMAL limit.
   */
  private enforceMessageSizeLimits(
    history: readonly Content[],
  ): readonly Content[] {
    const graceTurns = this.providerConfig.retainedMessages;
    let hasChanges = false;
    const normalized = history.map((msg, index) => {
      const isGraceZone = history.length - 1 - index < graceTurns;
      const targetTokens = isGraceZone
        ? this.providerConfig.maximumMessageTokens
        : this.providerConfig.normalMessageTokens;
      const newMsg = this.normalizeMessage(msg, targetTokens);
      if (newMsg !== msg) {
        hasChanges = true;
      }
      return newMsg;
    });
    return hasChanges ? normalized : history;
  }

  /**
   * Normalizes a message by proportionally masking its text or function response
   * if its total token count exceeds the target token limit.
   */
  private normalizeMessage(msg: Content, targetTokens: number): Content {
    const currentTokens = estimateTokenCountSync(msg.parts || []);
    if (currentTokens <= targetTokens) {
      return msg;
    }

    // Calculate the compression ratio to apply to all large parts
    const ratio = targetTokens / currentTokens;

    // Proportional compression of the parts to fit the targetTokens budget
    // while maintaining API structure (never dropping a part completely).
    const newParts: Part[] = [];
    for (const part of msg.parts || []) {
      if (part.text) {
        // Rough heuristic for current part tokens -> chars:
        const partTokens = part.text.length / CHARS_PER_TOKEN_ESTIMATE;
        const targetPartTokens = Math.max(
          MIN_TARGET_TOKENS,
          Math.floor(partTokens * ratio),
        );
        const targetChars = targetPartTokens * CHARS_PER_TOKEN_ESTIMATE;

        if (
          part.text.length > targetChars &&
          targetChars > MIN_CHARS_FOR_TRUNCATION
        ) {
          const newText = truncateProportionally(
            part.text,
            targetChars,
            TEXT_TRUNCATION_PREFIX,
            this.providerConfig.normalizationHeadRatio,
          );
          newParts.push({ text: newText });
        } else {
          newParts.push(part);
        }
      } else if (part.functionResponse) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const responseObj = part.functionResponse.response as Record<
          string,
          unknown
        >;
        const str = JSON.stringify(responseObj);

        const partTokens = str.length / CHARS_PER_TOKEN_ESTIMATE;
        const targetPartTokens = Math.max(
          MIN_TARGET_TOKENS,
          Math.floor(partTokens * ratio),
        );
        const targetChars = targetPartTokens * CHARS_PER_TOKEN_ESTIMATE;

        if (
          str.length > targetChars &&
          targetChars > MIN_CHARS_FOR_TRUNCATION
        ) {
          newParts.push({
            functionResponse: {
              name: part.functionResponse.name,
              id: part.functionResponse.id,
              response: {
                output: truncateProportionally(
                  str,
                  targetChars,
                  TOOL_TRUNCATION_PREFIX,
                  this.providerConfig.normalizationHeadRatio,
                ),
              },
            },
          });
        } else {
          newParts.push(part);
        }
      } else {
        newParts.push(part);
      }
    }

    return { ...msg, parts: newParts };
  }

  /**
   * Determines the boundary for splitting history based on the token budget,
   * keeping recent messages under a specific target token threshold,
   * while ensuring structural integrity (e.g. keeping functionCall/functionResponse pairs).
   */
  private splitHistoryForTruncation(history: readonly Content[]): {
    messagesToKeep: readonly Content[];
    messagesToTruncate: readonly Content[];
  } {
    let accumulatedTokens = 0;
    let truncationBoundary = 0; // The index of the first message to keep

    const graceTurns = this.providerConfig.retainedMessages;

    // Scan backwards to calculate the boundary based on token budget
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const isGraceZone = history.length - 1 - i < graceTurns;
      const msgTokens = estimateTokenCountSync(msg.parts || []);

      // 2. Archive Zone / Token Budget
      if (
        !isGraceZone &&
        accumulatedTokens + msgTokens > this.providerConfig.targetRetainedTokens
      ) {
        // Exceeded budget, stop retaining messages here.
        truncationBoundary = i + 1;
        break;
      }

      accumulatedTokens += msgTokens;
    }

    // 3. Ensure structural integrity of the boundary
    truncationBoundary = this.adjustBoundaryForIntegrity(
      history,
      truncationBoundary,
    );

    const messagesToKeep = history.slice(truncationBoundary);
    const messagesToTruncate = history.slice(0, truncationBoundary);

    return {
      messagesToKeep,
      messagesToTruncate,
    };
  }

  /**
   * Adjusts the truncation boundary backwards to prevent breaking functionCall/functionResponse pairs.
   */
  private adjustBoundaryForIntegrity(
    history: readonly Content[],
    boundary: number,
  ): number {
    let currentBoundary = boundary;
    while (
      currentBoundary > 0 &&
      currentBoundary < history.length &&
      history[currentBoundary].role === 'user' &&
      history[currentBoundary].parts?.some((p) => p.functionResponse) &&
      history[currentBoundary - 1].role === 'model' &&
      history[currentBoundary - 1].parts?.some((p) => p.functionCall)
    ) {
      currentBoundary--; // Include the functionCall in the retained history
    }
    return currentBoundary;
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
    if (!this.providerConfig.isSummarizationEnabled) {
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

    const summaryResponse = await this.config.getBaseLlmClient().generateContent({
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
