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
import { makeChatCompressionEvent } from '../telemetry/types.js';
import { getInitialChatHistory } from '../utils/environmentContext.js';

/**
 * Default threshold for compression token count as a fraction of the model's
 * token limit. If the chat history exceeds this threshold, it will be compressed.
 */
export const DEFAULT_COMPRESSION_TOKEN_THRESHOLD = 0.2;

/**
 * The fraction of the latest chat history to keep. A value of 0.3
 * means that only the last 30% of the chat history will be kept after compression.
 */
export const COMPRESSION_PRESERVE_THRESHOLD = 0.3;

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

export class ChatCompressionService {
  async compress(
    chat: GeminiChat,
    promptId: string,
    force: boolean,
    model: string,
    config: Config,
    hasFailedCompressionAttempt: boolean,
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

    const splitPoint = findCompressSplitPoint(
      curatedHistory,
      1 - COMPRESSION_PRESERVE_THRESHOLD,
    );

    const historyToCompress = curatedHistory.slice(0, splitPoint);
    const historyToKeep = curatedHistory.slice(splitPoint);

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

    const summaryResponse = await config.getContentGenerator().generateContent(
      {
        model,
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
        config: {
          systemInstruction: { text: getCompressionPrompt() },
        },
      },
      promptId,
    );
    const summary = getResponseText(summaryResponse) ?? '';

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

    // Estimate token count 1 token ≈ 4 characters
    const newTokenCount = Math.floor(
      fullNewHistory.reduce(
        (total, content) => total + JSON.stringify(content).length,
        0,
      ) / 4,
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
