/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import type { GeminiChat } from '../core/geminiChat.js';
import { type ChatCompressionInfo, CompressionStatus } from '../core/turn.js';
import { tokenLimit } from '../core/tokenLimits.js';
import { getCompressionPrompt } from '../core/prompts.js';
import { getResponseText } from '../utils/partUtils.js';
import { logChatCompression } from '../telemetry/loggers.js';
import { makeChatCompressionEvent, LlmRole } from '../telemetry/types.js';
import {
  saveTruncatedToolOutput,
  formatTruncatedToolOutput,
} from '../utils/fileUtils.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getInitialChatHistory } from '../utils/environmentContext.js';
import {
  calculateRequestTokenCount,
  estimateTokenCountSync,
} from '../utils/tokenCalculation.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
} from '../config/models.js';
import { PreCompressTrigger } from '../hooks/types.js';

/**
 * Default threshold for compression token count as a fraction of the model's
 * token limit. If the chat history exceeds this threshold, it will be compressed.
 */
const DEFAULT_COMPRESSION_TOKEN_THRESHOLD = 0.5;

/**
 * The fraction of the latest chat history to keep. A value of 0.3
 * means that only the last 30% of the chat history will be kept after compression.
 */
const COMPRESSION_PRESERVE_THRESHOLD = 0.3;

/**
 * The budget for function response tokens in the preserved history.
 */
const COMPRESSION_FUNCTION_RESPONSE_TOKEN_BUDGET = 50_000;

/**
 * Returns the index of the oldest item to keep when compressing. May return
 * contents.length which indicates that everything should be compressed.
 *
 * Exported for testing purposes.
 */
export function findCompressSplitPoint(
  contents: Content[],
  fraction: number,
): number {
  if (fraction <= 0 || fraction >= 1) {
    throw new Error('Fraction must be between 0 and 1');
  }

  const charCounts = contents.map((content) => JSON.stringify(content).length);
  const totalCharCount = charCounts.reduce((a, b) => a + b, 0);
  const targetCharCount = totalCharCount * fraction;

  let lastSplitPoint = 0; // 0 is always valid (compress nothing)
  let cumulativeCharCount = 0;
  for (let i = 0; i < contents.length; i++) {
    const content = contents[i];
    if (
      content.role === 'user' &&
      !content.parts?.some((part) => !!part.functionResponse)
    ) {
      if (cumulativeCharCount >= targetCharCount) {
        return i;
      }
      lastSplitPoint = i;
    }
    cumulativeCharCount += charCounts[i];
  }

  // We found no split points after targetCharCount.
  // Check if it's safe to compress everything.
  const lastContent = contents[contents.length - 1];
  if (
    lastContent?.role === 'model' &&
    !lastContent?.parts?.some((part) => part.functionCall)
  ) {
    return contents.length;
  }

  // Can't compress everything so just compress at last splitpoint.
  return lastSplitPoint;
}

export function modelStringToModelConfigAlias(model: string): string {
  switch (model) {
    case PREVIEW_GEMINI_MODEL:
    case PREVIEW_GEMINI_3_1_MODEL:
      return 'chat-compression-3-pro';
    case PREVIEW_GEMINI_FLASH_MODEL:
      return 'chat-compression-3-flash';
    case DEFAULT_GEMINI_MODEL:
      return 'chat-compression-2.5-pro';
    case DEFAULT_GEMINI_FLASH_MODEL:
      return 'chat-compression-2.5-flash';
    case DEFAULT_GEMINI_FLASH_LITE_MODEL:
      return 'chat-compression-2.5-flash-lite';
    default:
      return 'chat-compression-default';
  }
}

/**
 * Processes the chat history to ensure function responses don't exceed a specific token budget.
 *
 * This function implements a "Reverse Token Budget" strategy:
 * 1. It iterates through the history from the most recent turn to the oldest.
 * 2. It keeps a running tally of tokens used by function responses.
 * 3. Recent tool outputs are preserved in full to maintain high-fidelity context for the current turn.
 * 4. Once the budget (COMPRESSION_FUNCTION_RESPONSE_TOKEN_BUDGET) is exceeded, any older large
 *    tool responses are truncated to their last 30 lines and saved to a temporary file.
 *
 * This ensures that compression effectively reduces context size even when recent turns
 * contain massive tool outputs (like large grep results or logs).
 */
async function truncateHistoryToBudget(
  history: Content[],
  config: Config,
): Promise<Content[]> {
  let functionResponseTokenCounter = 0;
  const truncatedHistory: Content[] = [];

  // Iterate backwards: newest messages first to prioritize their context.
  for (let i = history.length - 1; i >= 0; i--) {
    const content = history[i];
    const newParts = [];

    if (content.parts) {
      // Process parts of the message backwards as well.
      for (let j = content.parts.length - 1; j >= 0; j--) {
        const part = content.parts[j];

        if (part.functionResponse) {
          const responseObj = part.functionResponse.response;
          // Ensure we have a string representation to truncate.
          // If the response is an object, we try to extract a primary string field (output or content).
          let contentStr: string;
          if (typeof responseObj === 'string') {
            contentStr = responseObj;
          } else if (responseObj && typeof responseObj === 'object') {
            if (
              'output' in responseObj &&
              typeof responseObj['output'] === 'string'
            ) {
              contentStr = responseObj['output'];
            } else if (
              'content' in responseObj &&
              typeof responseObj['content'] === 'string'
            ) {
              contentStr = responseObj['content'];
            } else {
              contentStr = JSON.stringify(responseObj, null, 2);
            }
          } else {
            contentStr = JSON.stringify(responseObj, null, 2);
          }

          const tokens = estimateTokenCountSync([{ text: contentStr }]);

          if (
            functionResponseTokenCounter + tokens >
            COMPRESSION_FUNCTION_RESPONSE_TOKEN_BUDGET
          ) {
            try {
              // Budget exceeded: Truncate this response.
              const { outputFile } = await saveTruncatedToolOutput(
                contentStr,
                part.functionResponse.name ?? 'unknown_tool',
                config.getNextCompressionTruncationId(),
                config.storage.getProjectTempDir(),
              );

              const truncatedMessage = formatTruncatedToolOutput(
                contentStr,
                outputFile,
                config.getTruncateToolOutputThreshold(),
              );

              newParts.unshift({
                functionResponse: {
                  ...part.functionResponse,
                  response: { output: truncatedMessage },
                },
              });

              // Count the small truncated placeholder towards the budget.
              functionResponseTokenCounter += estimateTokenCountSync([
                { text: truncatedMessage },
              ]);
            } catch (error) {
              // Fallback: if truncation fails, keep the original part to avoid data loss in the chat.
              debugLogger.debug('Failed to truncate history to budget:', error);
              newParts.unshift(part);
              functionResponseTokenCounter += tokens;
            }
          } else {
            // Within budget: keep the full response.
            functionResponseTokenCounter += tokens;
            newParts.unshift(part);
          }
        } else {
          // Non-tool response part: always keep.
          newParts.unshift(part);
        }
      }
    }

    // Reconstruct the message with processed (potentially truncated) parts.
    truncatedHistory.unshift({ ...content, parts: newParts });
  }

  return truncatedHistory;
}

export class ChatCompressionService {
  async compress(
    chat: GeminiChat,
    promptId: string,
    force: boolean,
    model: string,
    config: Config,
    hasFailedCompressionAttempt: boolean,
    abortSignal?: AbortSignal,
  ): Promise<{ newHistory: Content[] | null; info: ChatCompressionInfo }> {
    const curatedHistory = chat.getHistory(true);

    // Regardless of `force`, don't do anything if the history is empty.
    if (curatedHistory.length === 0) {
      return {
        newHistory: null,
        info: {
          originalTokenCount: 0,
          newTokenCount: 0,
          compressionStatus: CompressionStatus.NOOP,
        },
      };
    }

    // Fire PreCompress hook before compression
    // This fires for both manual and auto compression attempts
    const trigger = force ? PreCompressTrigger.Manual : PreCompressTrigger.Auto;
    await config.getHookSystem()?.firePreCompressEvent(trigger);

    const originalTokenCount = chat.getLastPromptTokenCount();

    // Don't compress if not forced and we are under the limit.
    if (!force) {
      const threshold =
        (await config.getCompressionThreshold()) ??
        DEFAULT_COMPRESSION_TOKEN_THRESHOLD;
      if (originalTokenCount < threshold * tokenLimit(model)) {
        return {
          newHistory: null,
          info: {
            originalTokenCount,
            newTokenCount: originalTokenCount,
            compressionStatus: CompressionStatus.NOOP,
          },
        };
      }
    }

    // Apply token-based truncation to the entire history before splitting.
    // This ensures that even the "to compress" portion is within safe limits for the summarization model.
    const truncatedHistory = await truncateHistoryToBudget(
      curatedHistory,
      config,
    );

    // If summarization previously failed (and not forced), we only rely on truncation.
    // We do NOT attempt to invoke the LLM for summarization again to avoid repeated failures/costs.
    if (hasFailedCompressionAttempt && !force) {
      const truncatedTokenCount = estimateTokenCountSync(
        truncatedHistory.flatMap((c) => c.parts || []),
      );

      // If truncation reduced the size, we consider it a successful "compression" (truncation only).
      if (truncatedTokenCount < originalTokenCount) {
        return {
          newHistory: truncatedHistory,
          info: {
            originalTokenCount,
            newTokenCount: truncatedTokenCount,
            compressionStatus: CompressionStatus.CONTENT_TRUNCATED,
          },
        };
      }

      return {
        newHistory: null,
        info: {
          originalTokenCount,
          newTokenCount: originalTokenCount,
          compressionStatus: CompressionStatus.NOOP,
        },
      };
    }

    const splitPoint = findCompressSplitPoint(
      truncatedHistory,
      1 - COMPRESSION_PRESERVE_THRESHOLD,
    );

    const historyToCompressTruncated = truncatedHistory.slice(0, splitPoint);
    const historyToKeepTruncated = truncatedHistory.slice(splitPoint);

    if (historyToCompressTruncated.length === 0) {
      return {
        newHistory: null,
        info: {
          originalTokenCount,
          newTokenCount: originalTokenCount,
          compressionStatus: CompressionStatus.NOOP,
        },
      };
    }

    // High Fidelity Decision: Should we send the original or truncated history to the summarizer?
    const originalHistoryToCompress = curatedHistory.slice(0, splitPoint);
    const originalToCompressTokenCount = estimateTokenCountSync(
      originalHistoryToCompress.flatMap((c) => c.parts || []),
    );

    const historyForSummarizer =
      originalToCompressTokenCount < tokenLimit(model)
        ? originalHistoryToCompress
        : historyToCompressTruncated;

    const hasPreviousSnapshot = historyForSummarizer.some((c) =>
      c.parts?.some((p) => p.text?.includes('<state_snapshot>')),
    );

    const anchorInstruction = hasPreviousSnapshot
      ? 'A previous <state_snapshot> exists in the history. You MUST integrate all still-relevant information from that snapshot into the new one, updating it with the more recent events. Do not lose established constraints or critical knowledge.'
      : 'Generate a new <state_snapshot> based on the provided history.';

    const summaryResponse = await config.getBaseLlmClient().generateContent({
      modelConfigKey: { model: modelStringToModelConfigAlias(model) },
      contents: [
        ...historyForSummarizer,
        {
          role: 'user',
          parts: [
            {
              text: `${anchorInstruction}\n\nFirst, reason in your scratchpad. Then, generate the updated <state_snapshot>.`,
            },
          ],
        },
      ],
      systemInstruction: { text: getCompressionPrompt(config) },
      promptId,
      // TODO(joshualitt): wire up a sensible abort signal,
      abortSignal: abortSignal ?? new AbortController().signal,
      role: LlmRole.UTILITY_COMPRESSOR,
    });
    const summary = getResponseText(summaryResponse) ?? '';

    // Phase 3: The "Probe" Verification (Self-Correction)
    // We perform a second lightweight turn to ensure no critical information was lost.
    const verificationResponse = await config
      .getBaseLlmClient()
      .generateContent({
        modelConfigKey: { model: modelStringToModelConfigAlias(model) },
        contents: [
          ...historyForSummarizer,
          {
            role: 'model',
            parts: [{ text: summary }],
          },
          {
            role: 'user',
            parts: [
              {
                text: 'Critically evaluate the <state_snapshot> you just generated. Did you omit any specific technical details, file paths, tool results, or user constraints mentioned in the history? If anything is missing or could be more precise, generate a FINAL, improved <state_snapshot>. Otherwise, repeat the exact same <state_snapshot> again.',
              },
            ],
          },
        ],
        systemInstruction: { text: getCompressionPrompt(config) },
        promptId: `${promptId}-verify`,
        role: LlmRole.UTILITY_COMPRESSOR,
        abortSignal: abortSignal ?? new AbortController().signal,
      });

    const finalSummary = (
      getResponseText(verificationResponse)?.trim() || summary
    ).trim();

    if (!finalSummary) {
      logChatCompression(
        config,
        makeChatCompressionEvent({
          tokens_before: originalTokenCount,
          tokens_after: originalTokenCount, // No change since it failed
        }),
      );
      return {
        newHistory: null,
        info: {
          originalTokenCount,
          newTokenCount: originalTokenCount,
          compressionStatus: CompressionStatus.COMPRESSION_FAILED_EMPTY_SUMMARY,
        },
      };
    }

    const extraHistory: Content[] = [
      {
        role: 'user',
        parts: [{ text: finalSummary }],
      },
      {
        role: 'model',
        parts: [{ text: 'Got it. Thanks for the additional context!' }],
      },
      ...historyToKeepTruncated,
    ];

    // Use a shared utility to construct the initial history for an accurate token count.
    const fullNewHistory = await getInitialChatHistory(config, extraHistory);

    const newTokenCount = await calculateRequestTokenCount(
      fullNewHistory.flatMap((c) => c.parts || []),
      config.getContentGenerator(),
      model,
    );

    logChatCompression(
      config,
      makeChatCompressionEvent({
        tokens_before: originalTokenCount,
        tokens_after: newTokenCount,
      }),
    );

    if (newTokenCount > originalTokenCount) {
      return {
        newHistory: null,
        info: {
          originalTokenCount,
          newTokenCount,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        },
      };
    } else {
      return {
        newHistory: extraHistory,
        info: {
          originalTokenCount,
          newTokenCount,
          compressionStatus: CompressionStatus.COMPRESSED,
        },
      };
    }
  }
}
