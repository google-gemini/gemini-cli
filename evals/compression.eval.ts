/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'vitest';
import { componentEvalTest } from './component-test-helper.js';
import {
  AgentHistoryProvider,
  ChatCompressionService,
  CompressionStatus,
  GeminiChat,
} from '@google/gemini-cli-core';
import type { Content } from '@google/genai';

// Create a highly repetitive and long chat history to trigger compression.
const createMockLongHistory = (numTurns: number = 30): Content[] => {
  const history: Content[] = [];
  for (let i = 0; i < numTurns; i++) {
    history.push({
      role: 'user',
      parts: [
        {
          text: `Here is a repetitive piece of context: The system is running nominally. The load is ${
            i % 100
          }%. All components operational. Please acknowledge and summarize the previous items.`,
        },
      ],
    });
    history.push({
      role: 'model',
      parts: [
        {
          text: `Acknowledged. The system load is ${
            i % 100
          }%. I am maintaining readiness. The previous items are nominal.`,
        },
      ],
    });
  }
  return history;
};

// --- AgentHistoryProvider Eval ---
componentEvalTest('USUALLY_PASSES', {
  name: 'AgentHistoryProvider correctly enforces High Watermark token limits',
  setup: async (config) => {
    // Optional setup before assertion
  },
  assert: async (config) => {
    // Configure provider with very tight constraints to force truncation immediately
    const providerConfig = {
      isTruncationEnabled: true,
      isSummarizationEnabled: true, // Need this to generate <state_snapshot>
      maxTokens: 500, // Trigger limit
      retainedTokens: 200, // Target budget after truncation
      normalMessageTokens: 100, // Limit for old messages
      maximumMessageTokens: 200, // Limit for newest messages
      normalizationHeadRatio: 0.1, // Required by AgentHistoryProviderConfig
    };

    const provider = new AgentHistoryProvider(providerConfig, config);
    const mockHistory = createMockLongHistory(30);

    const originalLength = mockHistory.length;
    const resultHistory = await provider.manageHistory(mockHistory);

    // The returned history should be compressed (fewer turns, as the older turns were summarized)
    expect(resultHistory.length).toBeLessThan(originalLength);

    // There should be a system prompt or a summarized state snapshot injected into the history
    const hasSummarizedContent = resultHistory.some(
      (content) =>
        content.role === 'user' &&
        content.parts?.[0]?.text?.includes('<intent_summary>'),
    );
    expect(hasSummarizedContent).toBe(true);
  },
});

// --- ChatCompressionService Eval ---
componentEvalTest('USUALLY_PASSES', {
  name: 'ChatCompressionService correctly condenses prompt history via Verification Probe',
  assert: async (config) => {
    const chatService = new ChatCompressionService();
    const mockContext = {
      config,
      promptId: 'test-prompt-id',
      toolRegistry: undefined as any,
      promptRegistry: undefined as any,
      resourceRegistry: undefined as any,
      messageBus: undefined as any,
      geminiClient: undefined as any,
      sandboxManager: undefined as any,
    };
    
    const chat = new GeminiChat(mockContext, '', [], createMockLongHistory(30));

    const result = await chatService.compress(
      chat,
      'test-prompt-id',
      true, // force compression
      'test-model',
      config,
      false, // hasFailedCompressionAttempt
    );

    expect(result.newHistory).toBeDefined();
    expect(result.newHistory).not.toBeNull();

    // Verify it returned a condensed history array
    expect(result.newHistory!.length).toBeLessThan(chat.getHistory().length);

    // Verify info metadata indicates a successful compression token reduction
    expect(result.info.newTokenCount).toBeLessThan(
      result.info.originalTokenCount,
    );
    expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);
  },
});
