/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgentHistoryProvider,
  truncateProportionally,
  TEXT_TRUNCATION_PREFIX,
} from './agentHistoryProvider.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';

vi.mock('../utils/tokenCalculation.js', () => ({
  estimateTokenCountSync: vi.fn(),
}));

import type { Content, GenerateContentResponse } from '@google/genai';
import type { Config } from '../config/config.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { AgentHistoryProviderConfig } from './types.js';

describe('AgentHistoryProvider', () => {
  let config: Config;
  let provider: AgentHistoryProvider;
  let providerConfig: AgentHistoryProviderConfig;
  let generateContentMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    config = {
      isExperimentalAgentHistoryTruncationEnabled: vi
        .fn()
        .mockReturnValue(false),
      isExperimentalAgentHistorySummarizationEnabled: vi
        .fn()
        .mockReturnValue(false),
      getBaseLlmClient: vi.fn(),
    } as unknown as Config;

    // By default, messages are small
    vi.mocked(estimateTokenCountSync).mockReturnValue(100);

    generateContentMock = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'Mock intent summary' }] } }],
    } as unknown as GenerateContentResponse);

    config.getBaseLlmClient = vi.fn().mockReturnValue({
      generateContent: generateContentMock,
    } as unknown as BaseLlmClient);
    providerConfig = {
      truncationThreshold: 30,
      retainedMessages: 15,
      targetRetainedTokens: 60000,
      normalMessageTokens: 2500,
      maximumMessageTokens: 10000,
      normalizationHeadRatio: 0.2,
      isSummarizationEnabled: false,
      isTruncationEnabled: false,
    };
    provider = new AgentHistoryProvider(providerConfig, config);
  });

  const createMockHistory = (count: number): Content[] =>
    Array.from({ length: count }).map((_, i) => ({
      role: i % 2 === 0 ? 'user' : 'model',
      parts: [{ text: `Message ${i}` }],
    }));

  it('should return history unchanged if truncation is disabled', async () => {
    providerConfig.isTruncationEnabled = false;

    const history = createMockHistory(40);
    const result = await provider.manageHistory(history);

    expect(result).toBe(history);
    expect(result.length).toBe(40);
  });

  it('should return history unchanged if length is under threshold', async () => {
    providerConfig.isTruncationEnabled = true;

    const history = createMockHistory(20); // Threshold is 30
    const result = await provider.manageHistory(history);

    expect(result).toBe(history);
    expect(result.length).toBe(20);
  });

  it('should truncate when total tokens exceed budget, preserving structural integrity', async () => {
    providerConfig.isTruncationEnabled = true;
    vi.spyOn(
      config,
      'isExperimentalAgentHistorySummarizationEnabled',
    ).mockReturnValue(false);

    // Make each message cost 4000 tokens
    vi.mocked(estimateTokenCountSync).mockReturnValue(4000);

    const history = createMockHistory(35); // Above 30 threshold
    const result = await provider.manageHistory(history);

    // Budget = 60000. Each message costs 4000. 60000 / 4000 = 15.
    // However, some messages get normalized.
    // The grace period is 15 messages. Their target is MAXIMUM_MESSAGE_TOKENS (10000).
    // So the 15 newest messages remain at 4000 tokens each.
    // That's 15 * 4000 = 60000 tokens EXACTLY!
    // The next older message will push it over budget.
    // So EXACTLY 15 messages will be retained.
    // If the 15th newest message is a user message with a functionResponse, it might pull in the model call.
    // In our createMockHistory, we don't use functionResponses.

    expect(result.length).toBe(15);
    expect(generateContentMock).not.toHaveBeenCalled();

    expect(result[0].role).toBe('user');
    expect(result[0].parts![0].text).toContain(
      'System Note: Prior conversation history was truncated',
    );
  });

  it('should call summarizer and prepend summary when summarization is enabled', async () => {
    providerConfig.isTruncationEnabled = true;
    providerConfig.isSummarizationEnabled = true;
    vi.spyOn(
      config,
      'isExperimentalAgentHistorySummarizationEnabled',
    ).mockReturnValue(true);

    vi.mocked(estimateTokenCountSync).mockReturnValue(4000);

    const history = createMockHistory(35);
    const result = await provider.manageHistory(history);

    expect(generateContentMock).toHaveBeenCalled();
    expect(result.length).toBe(15);
    expect(result[0].role).toBe('user');
    expect(result[0].parts![0].text).toContain('<intent_summary>');
    expect(result[0].parts![0].text).toContain('Mock intent summary');
  });

  it('should handle summarizer failures gracefully', async () => {
    providerConfig.isTruncationEnabled = true;
    providerConfig.isSummarizationEnabled = true;
    vi.spyOn(
      config,
      'isExperimentalAgentHistorySummarizationEnabled',
    ).mockReturnValue(true);
    vi.mocked(estimateTokenCountSync).mockReturnValue(4000);

    generateContentMock.mockRejectedValue(new Error('API Error'));

    const history = createMockHistory(35);
    const result = await provider.manageHistory(history);

    expect(generateContentMock).toHaveBeenCalled();
    expect(result.length).toBe(15);
    expect(result[0]).toMatchSnapshot();
  });

  describe('Tiered Normalization Logic', () => {
    it('normalizes large messages outside the grace period but not inside', async () => {
      providerConfig.isTruncationEnabled = true;

      // Grace period target is 10000. Normal target is 2500.
      const largeButNotHugeText = 'A'.repeat(6000);
      const history = createMockHistory(35);

      // Let's modify the last message (in grace period) and an old message (outside grace period).
      history[10].parts![0].text = largeButNotHugeText; // Old message
      history[34].parts![0].text = largeButNotHugeText; // New message

      // Dynamic token estimation based on length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(estimateTokenCountSync).mockImplementation((parts: any) => {
        if (!parts || parts.length === 0) return 0;
        const text = parts[0]?.text || '';
        if (text.includes('Message Normalized')) return 2500;

        // Return 5000 tokens for the large text
        if (text.length === 6000) return 5000;
        return 10;
      });

      const result = await provider.manageHistory(history);

      // The new message (index 34) has 5000 tokens <= MAXIMUM_MESSAGE_TOKENS (10000). So it is NOT normalized.
      expect(result[34].parts![0].text).toBe(largeButNotHugeText);

      // The old message (index 10) has 5000 tokens > NORMAL_MESSAGE_TOKENS (2500). So it IS normalized.
      expect(result.length).toBe(35);
      expect(result[10].parts![0].text).toContain(
        '[Message Normalized: Exceeded size limit]',
      );
    });

    it('normalizes function responses correctly', async () => {
      providerConfig.isTruncationEnabled = true;

      const history = createMockHistory(35);
      history[10] = {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'testTool',
              id: '123',
              response: {
                // Simulate a large JSON object
                output: 'B'.repeat(15000),
              },
            },
          },
        ],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(estimateTokenCountSync).mockImplementation((parts: any) => {
        if (parts[0]?.functionResponse) {
          // 15000 string length. targetTokens * 4 for functions. 2500 * 4 = 10000. 15000 > 10000.
          // Tokens must be > 2500
          return 4000;
        }
        return 10;
      });

      const result = await provider.manageHistory(history);
      expect(result.length).toBe(35);

      const fnRespStr = JSON.stringify(
        result[10].parts![0].functionResponse!.response,
      );
      expect(fnRespStr).toContain(
        '[Message Normalized: Tool output exceeded size limit]',
      );
    });
  });

  describe('truncateProportionally', () => {
    it('returns original string if under target chars', () => {
      const str = 'A'.repeat(50);
      expect(truncateProportionally(str, 100, TEXT_TRUNCATION_PREFIX)).toBe(
        str,
      );
    });

    it('truncates proportionally with prefix and ellipsis', () => {
      const str = 'A'.repeat(500) + 'B'.repeat(500); // 1000 chars
      const target = 100;
      const result = truncateProportionally(
        str,
        target,
        TEXT_TRUNCATION_PREFIX,
      );

      expect(result.startsWith(TEXT_TRUNCATION_PREFIX)).toBe(true);
      expect(result).toContain('\n...\n');

      // The prefix and ellipsis take up some space
      // It should keep ~20% head and ~80% tail of the *available* space
      const ellipsis = '\n...\n';
      const overhead = TEXT_TRUNCATION_PREFIX.length + ellipsis.length + 1; // +1 for the newline after prefix
      const availableChars = Math.max(0, target - overhead);
      const expectedHeadChars = Math.floor(availableChars * 0.2);
      const expectedTailChars = availableChars - expectedHeadChars;

      // Extract parts around the ellipsis
      const parts = result.split(ellipsis);
      expect(parts.length).toBe(2);

      // Remove prefix + newline from the first part to check head length
      const actualHead = parts[0].replace(TEXT_TRUNCATION_PREFIX + '\n', '');
      const actualTail = parts[1];

      expect(actualHead.length).toBe(expectedHeadChars);
      expect(actualTail.length).toBe(expectedTailChars);
    });

    it('handles very small targets gracefully by just returning prefix', () => {
      const str = 'A'.repeat(100);
      const result = truncateProportionally(str, 10, TEXT_TRUNCATION_PREFIX);
      expect(result).toBe(TEXT_TRUNCATION_PREFIX);
    });
  });

  describe('Multi-part Proportional Normalization', () => {
    it('distributes token budget proportionally across multiple large parts', async () => {
      providerConfig.isTruncationEnabled = true;

      const history = createMockHistory(35);

      // Make message 10 (outside grace period, target tokens = 2500) have two large parts
      // Part 1: 10000 chars (~2500 tokens at 4 chars/token)
      // Part 2: 30000 chars (~7500 tokens at 4 chars/token)
      // Total tokens = 10000. Target = 2500. Ratio = 0.25.
      const part1Text = 'A'.repeat(10000);
      const part2Text = 'B'.repeat(30000);

      history[10] = {
        role: 'user',
        parts: [{ text: part1Text }, { text: part2Text }],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(estimateTokenCountSync).mockImplementation((parts: any) => {
        if (!parts || parts.length === 0) return 10;

        if (
          parts.length === 2 &&
          parts[0].text?.startsWith('A') &&
          parts[1].text?.startsWith('B')
        ) {
          return 10000;
        }

        return 10;
      });

      const result = await provider.manageHistory(history);

      const normalizedMsg = result[10];
      expect(normalizedMsg.parts!.length).toBe(2);

      const p1 = normalizedMsg.parts![0].text!;
      const p2 = normalizedMsg.parts![1].text!;

      expect(p1).toContain(TEXT_TRUNCATION_PREFIX);
      expect(p2).toContain(TEXT_TRUNCATION_PREFIX);

      // Part 1 had ~2500 tokens -> gets 2500 * 0.25 = 625 tokens -> ~2500 chars limit
      // Part 2 had ~7500 tokens -> gets 7500 * 0.25 = 1875 tokens -> ~7500 chars limit
      // Let's verify p2 is significantly larger than p1 and within bounds
      expect(p1.length).toBeLessThan(3000);
      expect(p2.length).toBeLessThan(8000);
      expect(p1.length).toBeLessThan(p2.length);
    });

    it('preserves small parts while truncating large parts in the same message', async () => {
      providerConfig.isTruncationEnabled = true;

      const history = createMockHistory(35);

      const smallText = 'Hello I am small';
      const hugeText = 'B'.repeat(40000); // 10000 tokens

      history[10] = {
        role: 'user',
        parts: [{ text: smallText }, { text: hugeText }],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(estimateTokenCountSync).mockImplementation((parts: any) => {
        if (!parts || parts.length === 0) return 10;
        if (parts.length === 2 && parts[0].text === smallText) {
          return 10000;
        }
        return 10;
      });

      const result = await provider.manageHistory(history);

      const normalizedMsg = result[10];
      expect(normalizedMsg.parts!.length).toBe(2);

      const p1 = normalizedMsg.parts![0].text!;
      const p2 = normalizedMsg.parts![1].text!;

      // The small part's budget won't dip below its actual size because it's so small,
      // and it easily bypasses the MIN_CHARS_FOR_TRUNCATION check.
      expect(p1).toBe(smallText);

      // Huge part should be truncated
      expect(p2).toContain(TEXT_TRUNCATION_PREFIX);
      expect(p2.length).toBeLessThan(12000); // Target = 2500 * 4 = 10000
    });
  });
});
