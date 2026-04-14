/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ClusterSummarizer } from './clusterSummarizer.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { GenerateContentResponse } from '@google/genai';

function mockLlmClient(responseText: string): BaseLlmClient {
  return {
    generateContent: vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: responseText }],
          },
        },
      ],
    } as unknown as GenerateContentResponse),
  } as unknown as BaseLlmClient;
}

describe('ClusterSummarizer', () => {
  it('should call generateContent with cluster messages', async () => {
    const client = mockLlmClient('Summary of cluster');
    const summarizer = new ClusterSummarizer(
      client,
      'chat-compression-default',
    );

    const result = await summarizer.summarize([
      'User asked about file structure',
      'Model described src/ directory',
    ]);

    expect(result).toBe('Summary of cluster');
    expect(client.generateContent).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(client.generateContent).mock.calls[0][0];
    expect(callArgs.modelConfigKey).toEqual({
      model: 'chat-compression-default',
    });
    // The user prompt should contain the messages
    const userContent = callArgs.contents[callArgs.contents.length - 1];
    expect(userContent.parts![0].text).toContain(
      'User asked about file structure',
    );
  });

  it('should return fallback text on empty response', async () => {
    const client = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse),
    } as unknown as BaseLlmClient;

    const summarizer = new ClusterSummarizer(
      client,
      'chat-compression-default',
    );

    const result = await summarizer.summarize(['msg1', 'msg2']);
    // Should fall back to joining messages
    expect(result).toContain('msg1');
    expect(result).toContain('msg2');
  });

  it('should handle single message', async () => {
    const client = mockLlmClient('Single message summary');
    const summarizer = new ClusterSummarizer(
      client,
      'chat-compression-default',
    );

    const result = await summarizer.summarize(['just one message']);
    expect(result).toBe('Single message summary');
  });

  it('should handle generateContent throwing an error', async () => {
    const client = {
      generateContent: vi.fn().mockRejectedValue(new Error('API Error')),
    } as unknown as BaseLlmClient;

    const summarizer = new ClusterSummarizer(
      client,
      'chat-compression-default',
    );

    const result = await summarizer.summarize(['msg1', 'msg2']);
    // Should fall back to joining messages on error
    expect(result).toContain('msg1');
    expect(result).toContain('msg2');
  });
});
