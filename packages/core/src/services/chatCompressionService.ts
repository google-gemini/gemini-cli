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
import { getChatCompressionPrompt } from '../core/prompts.js';
import { getResponseText } from '../utils/partUtils.js';
import { logChatCompression } from '../telemetry/loggers.js';
import { makeChatCompressionEvent } from '../telemetry/types.js';
import { getInitialChatHistory } from '../utils/environmentContext.js';
import { calculateRequestTokenCount } from '../utils/tokenCalculation.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';

export interface CompressionOptions {
  userGoal?: string;
  preserveStrategy?: 'percentage' | 'since-last-prompt';
  preserveThreshold?: number;
}

/**
 * Extracts the discarded context summary from the XML response
 */
function extractDiscardedContextSummary(text: string): string | undefined {
  const match = text.match(
    /<discarded_context_summary>\s*([\s\S]*?)\s*<\/discarded_context_summary>/,
  );
  return match ? match[1].trim() : undefined;
}

/**
 * Default threshold for compression token count as a fraction of the model's
 * token limit. If the chat history exceeds this threshold, it will be compressed.
 */
export const DEFAULT_COMPRESSION_TOKEN_THRESHOLD = 0.5;

/**
 * The fraction of the latest chat history to keep. A value of 0.3
 * means that only the last 30% of the chat history will be kept after compression.
 */
export const COMPRESSION_PRESERVE_THRESHOLD = 0.3;

export interface SplitPointOptions {
  strategy: 'percentage' | 'since-last-prompt';
  minMessagesToCompress?: number;
  preserveThreshold?: number;
}

export interface SplitPointResult {
  splitIndex: number;
  historyToCompress: Content[];
  historyToKeep: Content[];
}

/**
 * Returns the index of the oldest item to keep when compressing. May return
 * contents.length which indicates that everything should be compressed.
 *
 * Exported for testing purposes.
 */
export function findCompressSplitPoint(
  contents: Content[],
  fractionOrOptions: number | SplitPointOptions,
): number | SplitPointResult | null {
  // Handle legacy number parameter (percentage-based)
  if (typeof fractionOrOptions === 'number') {
    const fraction = fractionOrOptions;
    if (fraction <= 0 || fraction >= 1) {
      throw new Error('Fraction must be between 0 and 1');
    }

    const charCounts = contents.map(
      (content) => JSON.stringify(content).length,
    );
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

  // Handle new options-based approach
  const options = fractionOrOptions;

  if (options.strategy === 'since-last-prompt') {
    // Find last user message index
    let lastUserMessageIndex = -1;
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }

    // No user message found or too early
    if (lastUserMessageIndex <= 0) {
      return null;
    }

    // Check if we have enough messages to compress
    const minMessagesToCompress = options.minMessagesToCompress ?? 5;
    if (lastUserMessageIndex < minMessagesToCompress) {
      return null;
    }

    // Return split result
    return {
      splitIndex: lastUserMessageIndex,
      historyToCompress: contents.slice(0, lastUserMessageIndex),
      historyToKeep: contents.slice(lastUserMessageIndex),
    };
  }

  // percentage strategy with new format
  const preserveThreshold = options.preserveThreshold ?? 0.3;
  const fraction = 1 - preserveThreshold;

  const charCounts = contents.map((content) => JSON.stringify(content).length);
  const totalCharCount = charCounts.reduce((a, b) => a + b, 0);
  const targetCharCount = totalCharCount * fraction;

  let lastSplitPoint = 0;
  let cumulativeCharCount = 0;
  for (let i = 0; i < contents.length; i++) {
    const content = contents[i];
    if (
      content.role === 'user' &&
      !content.parts?.some((part) => !!part.functionResponse)
    ) {
      if (cumulativeCharCount >= targetCharCount) {
        return {
          splitIndex: i,
          historyToCompress: contents.slice(0, i),
          historyToKeep: contents.slice(i),
        };
      }
      lastSplitPoint = i;
    }
    cumulativeCharCount += charCounts[i];
  }

  // Check if safe to compress everything
  const lastContent = contents[contents.length - 1];
  if (
    lastContent?.role === 'model' &&
    !lastContent?.parts?.some((part) => part.functionCall)
  ) {
    return {
      splitIndex: contents.length,
      historyToCompress: contents,
      historyToKeep: [],
    };
  }

  return {
    splitIndex: lastSplitPoint,
    historyToCompress: contents.slice(0, lastSplitPoint),
    historyToKeep: contents.slice(lastSplitPoint),
  };
}

export function modelStringToModelConfigAlias(model: string): string {
  switch (model) {
    case PREVIEW_GEMINI_MODEL:
      return 'chat-compression-3-pro';
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

export class ChatCompressionService {
  async compress(
    chat: GeminiChat,
    promptId: string,
    force: boolean,
    model: string,
    config: Config,
    hasFailedCompressionAttempt: boolean,
    options?: CompressionOptions,
  ): Promise<{ newHistory: Content[] | null; info: ChatCompressionInfo }> {
    const curatedHistory = chat.getHistory(true);

    // Regardless of `force`, don't do anything if the history is empty.
    if (
      curatedHistory.length === 0 ||
      (hasFailedCompressionAttempt && !force)
    ) {
      return {
        newHistory: null,
        info: {
          originalTokenCount: 0,
          newTokenCount: 0,
          compressionStatus: CompressionStatus.NOOP,
        },
      };
    }

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

    // Determine split strategy
    const preserveStrategy = options?.preserveStrategy ?? 'percentage';
    const userGoal = options?.userGoal;

    let historyToCompress: Content[];
    let historyToKeep: Content[];

    if (preserveStrategy === 'since-last-prompt') {
      const splitResult = findCompressSplitPoint(curatedHistory, {
        strategy: 'since-last-prompt',
        minMessagesToCompress: 5,
      });

      if (!splitResult || typeof splitResult === 'number') {
        // Fall back to percentage if split not possible
        const splitPoint = findCompressSplitPoint(
          curatedHistory,
          1 - COMPRESSION_PRESERVE_THRESHOLD,
        );
        historyToCompress = curatedHistory.slice(
          0,
          typeof splitPoint === 'number' ? splitPoint : 0,
        );
        historyToKeep = curatedHistory.slice(
          typeof splitPoint === 'number' ? splitPoint : 0,
        );
      } else {
        historyToCompress = splitResult.historyToCompress;
        historyToKeep = splitResult.historyToKeep;
      }
    } else {
      // percentage strategy
      const splitPoint = findCompressSplitPoint(
        curatedHistory,
        1 - (options?.preserveThreshold ?? COMPRESSION_PRESERVE_THRESHOLD),
      );
      historyToCompress = curatedHistory.slice(
        0,
        typeof splitPoint === 'number' ? splitPoint : 0,
      );
      historyToKeep = curatedHistory.slice(
        typeof splitPoint === 'number' ? splitPoint : 0,
      );
    }

    const messagesPreserved = historyToKeep.length;
    const messagesCompressed = historyToCompress.length;

    if (historyToCompress.length === 0) {
      return {
        newHistory: null,
        info: {
          originalTokenCount,
          newTokenCount: originalTokenCount,
          compressionStatus: CompressionStatus.NOOP,
        },
      };
    }

    const summaryResponse = await config.getBaseLlmClient().generateContent({
      modelConfigKey: { model: modelStringToModelConfigAlias(model) },
      contents: [
        ...historyToCompress,
        {
          role: 'user',
          parts: [
            {
              text: 'First, reason in your scratchpad. Then, generate the <state_snapshot>.',
            },
          ],
        },
      ],
      systemInstruction: { text: getChatCompressionPrompt(userGoal) },
      promptId,
      // TODO(joshualitt): wire up a sensible abort signal,
      abortSignal: new AbortController().signal,
    });
    const summary = getResponseText(summaryResponse) ?? '';

    // Extract discarded context summary from XML
    const discardedContextSummary = extractDiscardedContextSummary(summary);

    const extraHistory: Content[] = [
      {
        role: 'user',
        parts: [{ text: summary }],
      },
      {
        role: 'model',
        parts: [{ text: 'Got it. Thanks for the additional context!' }],
      },
      ...historyToKeep,
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
        goal_was_selected: !!userGoal,
        messages_preserved: messagesPreserved,
        messages_compressed: messagesCompressed,
        trigger_reason: preserveStrategy,
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
          messagesPreserved,
          messagesCompressed,
          goalWasSelected: !!userGoal,
          discardedContextSummary,
        },
      };
    } else {
      return {
        newHistory: extraHistory,
        info: {
          originalTokenCount,
          newTokenCount,
          compressionStatus: CompressionStatus.COMPRESSED,
          messagesPreserved,
          messagesCompressed,
          goalWasSelected: !!userGoal,
          discardedContextSummary,
        },
      };
    }
  }
}
