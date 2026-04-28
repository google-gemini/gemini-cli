/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentHistoryProvider } from './agentHistoryProvider.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';

vi.mock('../utils/tokenCalculation.js', () => ({
  estimateTokenCountSync: vi.fn(),
  ASCII_TOKENS_PER_CHAR: 0.25,
  NON_ASCII_TOKENS_PER_CHAR: 1.3,
}));

import type { Content, GenerateContentResponse, Part } from '@google/genai';
import type { Config } from '../config/config.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type {
  AgentHistoryProviderConfig,
  ContextManagementConfig,
} from './types.js';
import {
  TEXT_TRUNCATION_PREFIX,
  TOOL_TRUNCATION_PREFIX,
  truncateProportionally,
} from './truncation.js';

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
      getContextManagementConfig: vi.fn().mockReturnValue(false),
      getBaseLlmClient: vi.fn(),
    } as unknown as Config;

    // By default, messages are small
    vi.mocked(estimateTokenCountSync).mockImplementation(
      (parts: Part[]) => parts.length * 100,
    );
    generateContentMock = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'Mock intent summary' }] } }],
    } as unknown as GenerateContentResponse);

    config.getBaseLlmClient = vi.fn().mockReturnValue({
      generateContent: generateContentMock,
    } as unknown as BaseLlmClient);
    providerConfig = {
      maxTokens: 60000,
      retainedTokens: 40000,
      normalMessageTokens: 2500,
      maximumMessageTokens: 10000,
      normalizationHeadRatio: 0.2,
    };
    provider = new AgentHistoryProvider(providerConfig, config);
  });

  const createMockHistory = (count: number): Content[] =>
    Array.from({ length: count }).map((_, i) => ({
      role: i % 2 === 0 ? 'user' : 'model',
      parts: [{ text: `Message ${i}` }],
    }));

  it('should return history unchanged if length is under threshold', async () => {
    const history = createMockHistory(20); // Threshold is 30
    const result = await provider.manageHistory(history);

    expect(result).toBe(history);
    expect(result.length).toBe(20);
  });

  it('should truncate when total tokens exceed budget, preserving structural integrity', async () => {
    providerConfig.maxTokens = 60000;
    providerConfig.retainedTokens = 60000;
    vi.spyOn(config, 'getContextManagementConfig').mockReturnValue({
      enabled: false,
    } as unknown as ContextManagementConfig);

    // Make each message cost 4000 tokens
    vi.mocked(estimateTokenCountSync).mockImplementation(
      (parts: Part[]) => parts.length * 4000,
    );
    const history = createMockHistory(35); // 35 * 4000 = 140,000 total tokens > maxTokens
    const result = await provider.manageHistory(history);
    expect(result.length).toBe(15); // Budget = 60000. Each message costs 4000. 60000 / 4000 = 15.
  });

  it('should call summarizer and prepend summary', async () => {
    providerConfig.maxTokens = 60000;
    providerConfig.retainedTokens = 60000;
    vi.spyOn(config, 'getContextManagementConfig').mockReturnValue({
      enabled: true,
    } as unknown as ContextManagementConfig);

    vi.mocked(estimateTokenCountSync).mockImplementation(
      (parts: Part[]) => parts.length * 4000,
    );
    const history = createMockHistory(35);
    const result = await provider.manageHistory(history);

    expect(generateContentMock).toHaveBeenCalled();
    expect(result.length).toBe(15);
    expect(result[0].role).toBe('user');
    expect(result[0].parts![0].text).toContain('<intent_summary>');
    expect(result[0].parts![0].text).toContain('Mock intent summary');
  });

  it('should handle summarizer failures gracefully', async () => {
    providerConfig.maxTokens = 60000;
    providerConfig.retainedTokens = 60000;
    vi.spyOn(config, 'getContextManagementConfig').mockReturnValue({
      enabled: true,
    } as unknown as ContextManagementConfig);
    vi.mocked(estimateTokenCountSync).mockImplementation(
      (parts: Part[]) => parts.length * 4000,
    );
    generateContentMock.mockRejectedValue(new Error('API Error'));

    const history = createMockHistory(35);
    const result = await provider.manageHistory(history);

    expect(generateContentMock).toHaveBeenCalled();
    expect(result.length).toBe(15);
    // Should fallback to fallback text
    expect(result[0].parts![0].text).toContain(
      '[System Note: Conversation History Truncated]',
    );
  });

  it('should pass the contextual bridge to the summarizer', async () => {
    vi.spyOn(config, 'getContextManagementConfig').mockReturnValue({
      enabled: true,
    } as unknown as ContextManagementConfig);

    // Max tokens 30 means if total tokens > 30, it WILL truncate.
    providerConfig.maxTokens = 30;
    // budget 20 tokens means it will keep 2 messages if they are 10 each.
    providerConfig.retainedTokens = 20;

    vi.mocked(estimateTokenCountSync).mockImplementation(
      (parts: Part[]) => parts.length * 10,
    );
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'Old Message' }] },
      { role: 'model', parts: [{ text: 'Old Response' }] },
      { role: 'user', parts: [{ text: 'Keep 1' }] },
      { role: 'user', parts: [{ text: 'Keep 2' }] },
    ];

    await provider.manageHistory(history);

    expect(generateContentMock).toHaveBeenCalled();
    const callArgs = generateContentMock.mock.calls[0][0];
    const prompt = callArgs.contents[0].parts[0].text;

    expect(prompt).toContain('ACTIVE BRIDGE (LOOKAHEAD):');
    expect(prompt).toContain('Keep 1');
    expect(prompt).toContain('Keep 2');
  });

  it('should detect a previous summary in the truncated head', async () => {
    vi.spyOn(config, 'getContextManagementConfig').mockReturnValue({
      enabled: true,
    } as unknown as ContextManagementConfig);

    providerConfig.maxTokens = 20;
    providerConfig.retainedTokens = 10;

    vi.mocked(estimateTokenCountSync).mockImplementation(
      (parts: Part[]) => parts.length * 10,
    );
    const history: Content[] = [
      {
        role: 'user',
        parts: [{ text: '<intent_summary>Previous Mandate</intent_summary>' }],
      },
      { role: 'model', parts: [{ text: 'Work' }] },
      { role: 'user', parts: [{ text: 'New Work' }] },
    ];

    await provider.manageHistory(history);

    expect(generateContentMock).toHaveBeenCalled();
    const callArgs = generateContentMock.mock.calls[0][0];
    const prompt = callArgs.contents[0].parts[0].text;

    expect(prompt).toContain('1. **Previous Summary:**');
    expect(prompt).toContain('PREVIOUS SUMMARY AND TRUNCATED HISTORY:');
  });

  it('should include the Action Path (necklace of function names) in the prompt', async () => {
    vi.spyOn(config, 'getContextManagementConfig').mockReturnValue({
      enabled: true,
    } as unknown as ContextManagementConfig);

    providerConfig.maxTokens = 20;
    providerConfig.retainedTokens = 10;

    vi.mocked(estimateTokenCountSync).mockImplementation(
      (parts: Part[]) => parts.length * 10,
    );
    const history: Content[] = [
      {
        role: 'model',
        parts: [
          { functionCall: { name: 'tool_a', args: {} } },
          { functionCall: { name: 'tool_b', args: {} } },
        ],
      },
      { role: 'user', parts: [{ text: 'Keep' }] },
    ];

    await provider.manageHistory(history);

    expect(generateContentMock).toHaveBeenCalled();
    const callArgs = generateContentMock.mock.calls[0][0];
    const prompt = callArgs.contents[0].parts[0].text;

    expect(prompt).toContain('The Action Path:');
    expect(prompt).toContain('tool_a → tool_b');
  });

  describe('Tiered Normalization Logic', () => {
    it('normalizes large messages incrementally: newest and exit-grace', async () => {
      providerConfig.retainedTokens = 30000;
      providerConfig.maximumMessageTokens = 10000;
      providerConfig.normalMessageTokens = 2500; // History of 35 messages.
      // Index 34: Newest (Grace Zone) -> Target 10000 tokens (~40000 chars)
      // Index 19: Exit Grace (35-1-15=19) -> Target 2500 tokens (~10000 chars)
      // Index 10: Archived -> Should NOT be normalized in this turn (Incremental optimization)
      const history = createMockHistory(35);
      const hugeText = 'H'.repeat(100000);

      history[34] = { role: 'user', parts: [{ text: hugeText }] };
      history[19] = { role: 'model', parts: [{ text: hugeText }] };
      history[10] = { role: 'user', parts: [{ text: hugeText }] };

      // Mock token count to trigger normalization (100k chars = 25k tokens @ 4 chars/token)
      vi.mocked(estimateTokenCountSync).mockImplementation((parts: Part[]) => {
        if (!parts?.[0]) return 10;
        const text = parts[0].text || '';
        if (text.startsWith('H')) return 25000;
        return 10;
      });

      const result = await provider.manageHistory(history);

      // 1. Newest message (index 34) normalized to ~40000 chars
      const normalizedLast = result[34].parts![0].text!;
      expect(normalizedLast).toContain(TEXT_TRUNCATION_PREFIX);
      expect(normalizedLast.length).toBeLessThan(50000);
      expect(normalizedLast.length).toBeGreaterThan(30000);

      // 2. Exit grace message (index 19) normalized to ~10000 chars
      const normalizedArchived = result[19].parts![0].text!;
      expect(normalizedArchived).toContain(TEXT_TRUNCATION_PREFIX);
      expect(normalizedArchived.length).toBeLessThan(15000);
      expect(normalizedArchived.length).toBeGreaterThan(8000);

      // 3. Archived message (index 10) IS touched and normalized to ~10000 chars
      const normalizedPastArchived = result[10].parts![0].text!;
      expect(normalizedPastArchived).toContain(TEXT_TRUNCATION_PREFIX);
      expect(normalizedPastArchived.length).toBeLessThan(15000);
      expect(normalizedPastArchived.length).toBeGreaterThan(8000);
    });

    it('normalize function responses correctly by targeting large string values', async () => {
      providerConfig.maximumMessageTokens = 1000;

      const hugeValue = 'O'.repeat(5000);
      const history: Content[] = [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'test_tool',
                id: '1',
                response: {
                  stdout: hugeValue,
                  stderr: 'small error',
                  exitCode: 0,
                },
              },
            },
          ],
        },
      ];

      vi.mocked(estimateTokenCountSync).mockImplementation(
        (parts: readonly Part[]) => {
          if (parts?.[0]?.functionResponse) return 5000;
          return 10;
        },
      );

      const result = await provider.manageHistory(history);

      const fr = result[0].parts![0].functionResponse!;
      const resp = fr.response as Record<string, unknown>;

      // stdout should be truncated
      expect(resp['stdout']).toContain(TOOL_TRUNCATION_PREFIX);
      expect((resp['stdout'] as string).length).toBeLessThan(hugeValue.length);

      // stderr and exitCode should be PRESERVED (JSON integrity)
      expect(resp['stderr']).toBe('small error');
      expect(resp['exitCode']).toBe(0);

      // Schema should be intact
      expect(fr.name).toBe('test_tool');
      expect(fr.id).toBe('1');
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
      providerConfig.maximumMessageTokens = 2500; // Small limit to trigger normalization on last msg

      const history = createMockHistory(35);

      // Make newest message (index 34) have two large parts
      // Part 1: 10000 chars (~2500 tokens at 4 chars/token)
      // Part 2: 30000 chars (~7500 tokens at 4 chars/token)
      // Total tokens = 10000. Target = 2500. Ratio = 0.25.
      const part1Text = 'A'.repeat(10000);
      const part2Text = 'B'.repeat(30000);

      history[34] = {
        role: 'user',
        parts: [{ text: part1Text }, { text: part2Text }],
      };

      vi.mocked(estimateTokenCountSync).mockImplementation(
        (parts: readonly Part[]) => {
          if (!parts || parts.length === 0) return 0;
          let tokens = 0;
          for (const p of parts) {
            if (p.text?.startsWith('A')) tokens += 2500;
            else if (p.text?.startsWith('B')) tokens += 7500;
            else tokens += 10;
          }
          return tokens;
        },
      );

      const result = await provider.manageHistory(history);

      const normalizedMsg = result[34];
      expect(normalizedMsg.parts!.length).toBe(2);

      const p1 = normalizedMsg.parts![0].text!;
      const p2 = normalizedMsg.parts![1].text!;

      expect(p1).toContain(TEXT_TRUNCATION_PREFIX);
      expect(p2).toContain(TEXT_TRUNCATION_PREFIX);

      // Part 1: Target chars ~ 2500 * 0.25 * 4 = 2500
      // Part 2: Target chars ~ 7500 * 0.25 * 4 = 7500
      expect(p1.length).toBeLessThan(3500);
      expect(p2.length).toBeLessThan(9000);
      expect(p1.length).toBeLessThan(p2.length);
    });

    it('preserves small parts while truncating large parts in the same message', async () => {
      providerConfig.maximumMessageTokens = 2500;

      const history = createMockHistory(35);

      const smallText = 'Hello I am small';
      const hugeText = 'B'.repeat(40000); // 10000 tokens

      history[34] = {
        role: 'user',
        parts: [{ text: smallText }, { text: hugeText }],
      };

      vi.mocked(estimateTokenCountSync).mockImplementation(
        (parts: readonly Part[]) => {
          if (!parts || parts.length === 0) return 0;
          let tokens = 0;
          for (const p of parts) {
            if (p.text === smallText) tokens += 10;
            else if (p.text?.startsWith('B')) tokens += 10000;
            else tokens += 10;
          }
          return tokens;
        },
      );

      const result = await provider.manageHistory(history);

      const normalizedMsg = result[34];
      expect(normalizedMsg.parts!.length).toBe(2);

      const p1 = normalizedMsg.parts![0].text!;
      const p2 = normalizedMsg.parts![1].text!;

      // Small part should be preserved
      expect(p1).toBe(smallText);

      // Huge part should be truncated
      expect(p2).toContain(TEXT_TRUNCATION_PREFIX);
      // Target tokens for huge part = ~2500 * (10000/10010) = ~2500
      // Target chars = ~10000
      expect(p2.length).toBeLessThan(12000);
    });
  });
});
