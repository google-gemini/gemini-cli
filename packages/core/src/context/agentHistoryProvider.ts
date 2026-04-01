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
import type { AgentHistoryProviderConfig } from '../services/types.js';
import type { Config } from '../config/config.js';
import {
  MIN_TARGET_TOKENS,
  MIN_CHARS_FOR_TRUNCATION,
  TEXT_TRUNCATION_PREFIX,
  estimateCharsFromTokens,
  truncateProportionally,
  normalizeFunctionResponse,
} from './truncation.js';

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
    if (!this.providerConfig.isTruncationEnabled || history.length === 0) {
      return history;
    }

    // Step 1: Normalize newest messages.
    const normalizedHistory = this.enforceMessageSizeLimits(history);

    const totalTokens = estimateTokenCountSync(
      normalizedHistory.flatMap((c) => c.parts || []),
    );

    // Step 2: Check if truncation is needed based on the token threshold (High Watermark)
    if (totalTokens <= this.providerConfig.maxTokens) {
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
      messagesToKeep,
      abortSignal,
    );

    return this.mergeSummaryWithHistory(summaryText, messagesToKeep);
  }

  /**
   * Enforces message size limits on the most recent message and the message
   * that just exited the grace zone.
   * - Recent messages have a high MAXIMUM limit.
   * - Older messages (already processed) are restricted to the NORMAL limit
   *   once they exit the grace period.
   */
  private enforceMessageSizeLimits(
    history: readonly Content[],
  ): readonly Content[] {
    if (history.length === 0) return history;

    let hasChanges = false;
    let accumulatedTokens = 0;

    // Scan backwards to find the index where the token budget is exhausted
    let graceStartIndex = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokenCountSync(history[i].parts || []);
      accumulatedTokens += msgTokens;
      if (accumulatedTokens > this.providerConfig.retainedTokens) {
        graceStartIndex = i + 1;
        break;
      }
    }

    const newHistory = history.map((msg, i) => {
      const targetTokens =
        i < graceStartIndex
          ? this.providerConfig.normalMessageTokens
          : this.providerConfig.maximumMessageTokens;

      const normalizedMsg = this.normalizeMessage(msg, targetTokens);
      if (normalizedMsg !== msg) {
        hasChanges = true;
      }
      return normalizedMsg;
    });

    return hasChanges ? newHistory : history;
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
        const partTokens = estimateTokenCountSync([part]);
        const targetPartTokens = Math.max(
          MIN_TARGET_TOKENS,
          Math.floor(partTokens * ratio),
        );
        const targetChars = estimateCharsFromTokens(
          part.text,
          targetPartTokens,
        );

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
        newParts.push(
          normalizeFunctionResponse(
            part,
            ratio,
            this.providerConfig.normalizationHeadRatio,
          ),
        );
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

    // Scan backwards to calculate the boundary based on token budget
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const msgTokens = estimateTokenCountSync(msg.parts || []);

      // Token Budget
      if (accumulatedTokens + msgTokens > this.providerConfig.retainedTokens) {
        // Exceeded budget, stop retaining messages here.
        truncationBoundary = i + 1;
        break;
      }

      accumulatedTokens += msgTokens;
    }

    // Ensure structural integrity of the boundary
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
    // Ensure we don't start at index 0 or out of bounds.
    if (currentBoundary <= 0 || currentBoundary >= history.length) {
      return currentBoundary;
    }

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
    const userMessages = messagesToTruncate.filter((m) => m.role === 'user');
    const modelMessages = messagesToTruncate.filter((m) => m.role === 'model');

    const lastUserText = userMessages
      .slice(-1)[0]
      ?.parts?.map((p) => p.text || '')
      .join('')
      .trim();

    const actionPath = modelMessages
      .flatMap(
        (m) =>
          m.parts
            ?.filter((p) => p.functionCall)
            .map((p) => p.functionCall!.name) || [],
      )
      .join(' → ');

    const summaryParts = [
      '### [System Note: Conversation History Truncated]',
      'Prior context was offloaded to maintain performance. Key highlights from the truncated history:',
    ];

    if (lastUserText) {
      summaryParts.push(`- **Last User Intent:** "${lastUserText}"`);
    }

    if (actionPath) {
      summaryParts.push(`- **Action Path:** ${actionPath}`);
    }

    summaryParts.push(
      '- **Notice:** For deeper context, review persistent memory or task-specific logs.',
    );

    return summaryParts.join('\n');
  }

  private async getSummaryText(
    messagesToTruncate: readonly Content[],
    messagesToKeep: readonly Content[],
    abortSignal?: AbortSignal,
  ): Promise<string> {
    if (messagesToTruncate.length === 0) return '';

    if (!this.providerConfig.isSummarizationEnabled) {
      debugLogger.log(
        'AgentHistoryProvider: Summarization disabled, using fallback note.',
      );
      return this.getFallbackSummaryText(messagesToTruncate);
    }

    try {
      // Use the first few messages of the Grace Zone as a "contextual bridge"
      // to give the summarizer lookahead into the current state.
      const bridge = messagesToKeep.slice(0, 5);

      return await this.generateIntentSummary(
        messagesToTruncate,
        bridge,
        abortSignal,
      );
    } catch (error) {
      debugLogger.log('AgentHistoryProvider: Summarization failed.', error);
      return this.getFallbackSummaryText(messagesToTruncate);
    }
  }

  private mergeSummaryWithHistory(
    summaryText: string,
    messagesToKeep: readonly Content[],
  ): readonly Content[] {
    if (!summaryText) return messagesToKeep;

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
    bridge: readonly Content[],
    abortSignal?: AbortSignal,
  ): Promise<string> {
    // 1. Identify and extract any existing summary from the truncated head
    const firstMsg = messagesToTruncate[0];
    const firstPartText = firstMsg?.parts?.[0]?.text || '';
    const hasPreviousSummary = firstPartText.includes('<intent_summary>');

    // 2. Extract "The Action Path" (necklace of function names)
    const actionPath = messagesToTruncate
      .filter((m) => m.role === 'model')
      .flatMap(
        (m) =>
          m.parts
            ?.filter((p) => p.functionCall)
            .map((p) => p.functionCall!.name) || [],
      )
      .join(' → ');

    const prompt = `### State Update: Agent Continuity

The conversation history has been truncated. You are generating a highly factual state summary to preserve the agent's exact working context.

You have these signals to synthesize:
${hasPreviousSummary ? '1. **Previous Summary:** The existing state before this truncation.\n' : ''}2. **The Action Path:** A chronological list of tools called: [${actionPath}]
3. **Truncated History:** The specific actions, tool inputs, and tool outputs being offloaded.
4. **Active Bridge:** The first few turns of the "Grace Zone" (what follows immediately after this summary), showing the current tactical moment.

### Your Goal:
Distill these into a high-density Markdown block that orientates the agent on the CONCRETE STATE of the workspace:
- **Primary Goal:** The ultimate objective requested by the user.
- **Verified Facts:** What has been definitively completed or proven (e.g., "File X was created", "Bug Y was reproduced").
- **Working Set:** The exact file paths currently being analyzed or modified.
- **Active Blockers:** Exact error messages or failing test names currently preventing progress.

### Constraints:
- **Format:** Wrap the entire response in <intent_summary> tags.
- **Factuality:** Base all points strictly on the provided history. Do not invent rationale or assume success without proof. Use exact names and quotes.
- **Brevity:** Maximum 15 lines. No conversational preamble.

${hasPreviousSummary ? 'PREVIOUS SUMMARY AND TRUNCATED HISTORY:' : 'TRUNCATED HISTORY:'}
${JSON.stringify(messagesToTruncate)}

ACTIVE BRIDGE (LOOKAHEAD):
${JSON.stringify(bridge)}`;

    const summaryResponse = await this.config
      .getBaseLlmClient()
      .generateContent({
        modelConfigKey: { model: 'agent-history-provider-summarizer' },
        contents: [
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
    // Clean up if the model included extra tags or markdown
    summary = summary
      .replace(/```markdown/g, '')
      .replace(/```/g, '')
      .trim();

    if (!summary.includes('<intent_summary>')) {
      summary = `<intent_summary>\n${summary}\n</intent_summary>`;
    }

    return summary;
  }
}
