/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentHistoryProvider } from './agentHistoryProvider.js';
import type { Content, GenerateContentResponse } from '@google/genai';
import type { Config } from '../config/config.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';

describe('AgentHistoryProvider', () => {
  let config: Config;
  let provider: AgentHistoryProvider;
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

    generateContentMock = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'Mock intent summary' }] } }],
    } as unknown as GenerateContentResponse);

    config.getBaseLlmClient = vi.fn().mockReturnValue({
      generateContent: generateContentMock,
    } as unknown as BaseLlmClient);

    provider = new AgentHistoryProvider(config, {
      truncationThreshold: 30,
      retainedMessages: 15,
    });
  });

  const createMockHistory = (count: number): Content[] =>
    Array.from({ length: count }).map((_, i) => ({
      role: i % 2 === 0 ? 'user' : 'model',
      parts: [{ text: `Message ${i}` }],
    }));

  it('should return history unchanged if truncation is disabled', async () => {
    vi.spyOn(
      config,
      'isExperimentalAgentHistoryTruncationEnabled',
    ).mockReturnValue(false);

    const history = createMockHistory(40);
    const result = await provider.manageHistory(history);

    expect(result).toBe(history);
    expect(result.length).toBe(40);
  });

  it('should return history unchanged if length is under threshold', async () => {
    vi.spyOn(
      config,
      'isExperimentalAgentHistoryTruncationEnabled',
    ).mockReturnValue(true);

    const history = createMockHistory(20); // Threshold is 30
    const result = await provider.manageHistory(history);

    expect(result).toBe(history);
    expect(result.length).toBe(20);
  });

  it('should truncate mechanically to RETAINED_MESSAGES without summarization when sum flag is off', async () => {
    vi.spyOn(
      config,
      'isExperimentalAgentHistoryTruncationEnabled',
    ).mockReturnValue(true);
    vi.spyOn(
      config,
      'isExperimentalAgentHistorySummarizationEnabled',
    ).mockReturnValue(false);

    const history = createMockHistory(35); // Above 30 threshold, should truncate to 15
    const result = await provider.manageHistory(history);

    expect(result.length).toBe(15);
    expect(generateContentMock).not.toHaveBeenCalled();

    // Check fallback message logic
    // Messages 20 to 34 are retained. Message 20 is 'user'.
    expect(result[0].role).toBe('user');
    expect(result[0].parts![0].text).toContain(
      'System Note: Prior conversation history was truncated',
    );
  });

  it('should call summarizer and prepend summary when summarization is enabled', async () => {
    vi.spyOn(
      config,
      'isExperimentalAgentHistoryTruncationEnabled',
    ).mockReturnValue(true);
    vi.spyOn(
      config,
      'isExperimentalAgentHistorySummarizationEnabled',
    ).mockReturnValue(true);

    const history = createMockHistory(35);
    const result = await provider.manageHistory(history);

    expect(generateContentMock).toHaveBeenCalled();
    expect(result.length).toBe(15); // retained messages
    expect(result[0].role).toBe('user');
    expect(result[0].parts![0].text).toContain('<intent_summary>');
    expect(result[0].parts![0].text).toContain('Mock intent summary');
  });

  it('should handle summarizer failures gracefully', async () => {
    vi.spyOn(
      config,
      'isExperimentalAgentHistoryTruncationEnabled',
    ).mockReturnValue(true);
    vi.spyOn(
      config,
      'isExperimentalAgentHistorySummarizationEnabled',
    ).mockReturnValue(true);

    generateContentMock.mockRejectedValue(new Error('API Error'));

    const history = createMockHistory(35);
    const result = await provider.manageHistory(history);

    expect(generateContentMock).toHaveBeenCalled();
    expect(result.length).toBe(15);
    expect(result[0]).toMatchSnapshot();
  });
});
