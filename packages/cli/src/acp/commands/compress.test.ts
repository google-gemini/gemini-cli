/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompressionStatus } from '@google/gemini-cli-core';
import { CompressCommand } from './compress.js';
import type { CommandContext } from './types.js';

function createContext(
  tryCompressChat: ReturnType<typeof vi.fn>,
): CommandContext {
  return {
    agentContext: {
      geminiClient: { tryCompressChat },
    } as unknown as CommandContext['agentContext'],
    settings: {} as CommandContext['settings'],
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CompressCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes /summarize and /compact as aliases', () => {
    const command = new CompressCommand();
    expect(command.name).toBe('compress');
    expect(command.aliases).toEqual(['summarize', 'compact']);
  });

  it('invokes tryCompressChat with force=true', async () => {
    const tryCompressChat = vi.fn().mockResolvedValue({
      originalTokenCount: 1000,
      newTokenCount: 200,
      compressionStatus: CompressionStatus.COMPRESSED,
    });
    const command = new CompressCommand();
    const context = createContext(tryCompressChat);

    await command.execute(context, []);

    expect(tryCompressChat).toHaveBeenCalledTimes(1);
    const call = tryCompressChat.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    const [promptId, force] = call;
    expect(typeof promptId).toBe('string');
    expect(promptId).toMatch(/^compress-/);
    expect(force).toBe(true);
  });

  it('reports the new and original token counts on success', async () => {
    const tryCompressChat = vi.fn().mockResolvedValue({
      originalTokenCount: 12000,
      newTokenCount: 800,
      compressionStatus: CompressionStatus.COMPRESSED,
    });
    const command = new CompressCommand();
    const context = createContext(tryCompressChat);

    const result = await command.execute(context, []);

    expect(result.name).toBe('compress');
    expect(result.data).toBe('Compressed conversation: 12000 → 800 tokens.');
  });

  it('reports NOOP when compression was unnecessary', async () => {
    const tryCompressChat = vi.fn().mockResolvedValue({
      originalTokenCount: 100,
      newTokenCount: 100,
      compressionStatus: CompressionStatus.NOOP,
    });
    const command = new CompressCommand();
    const context = createContext(tryCompressChat);

    const result = await command.execute(context, []);

    expect(result.data).toContain('No compression needed');
  });

  it('reports CONTENT_TRUNCATED with the token delta', async () => {
    const tryCompressChat = vi.fn().mockResolvedValue({
      originalTokenCount: 20000,
      newTokenCount: 18000,
      compressionStatus: CompressionStatus.CONTENT_TRUNCATED,
    });
    const command = new CompressCommand();
    const context = createContext(tryCompressChat);

    const result = await command.execute(context, []);

    expect(result.data).toContain('truncated');
    expect(result.data).toContain('20000 → 18000');
  });

  it.each([
    [
      CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      'summary was larger than the original',
    ],
    [
      CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
      'could not count tokens',
    ],
    [CompressionStatus.COMPRESSION_FAILED_EMPTY_SUMMARY, 'summary was empty'],
  ])('surfaces structured failure for status %i', async (status, hint) => {
    const tryCompressChat = vi.fn().mockResolvedValue({
      originalTokenCount: 5000,
      newTokenCount: 5000,
      compressionStatus: status,
    });
    const command = new CompressCommand();
    const context = createContext(tryCompressChat);

    const result = await command.execute(context, []);

    expect(result.data).toContain('Failed to compress chat history');
    expect(result.data).toContain(hint);
  });

  it('returns a generic failure for unknown status codes', async () => {
    const tryCompressChat = vi.fn().mockResolvedValue({
      originalTokenCount: 0,
      newTokenCount: 0,
      compressionStatus: -1 as unknown as CompressionStatus,
    });
    const command = new CompressCommand();
    const context = createContext(tryCompressChat);

    const result = await command.execute(context, []);

    expect(result.data).toBe('Failed to compress chat history.');
  });

  it('catches thrown errors from the client', async () => {
    const tryCompressChat = vi
      .fn()
      .mockRejectedValue(new Error('Network down'));
    const command = new CompressCommand();
    const context = createContext(tryCompressChat);

    const result = await command.execute(context, []);

    expect(result.data).toContain('Failed to compress chat history');
    expect(result.data).toContain('Network down');
  });

  it('reports a not-available error when geminiClient is missing', async () => {
    const command = new CompressCommand();
    const context: CommandContext = {
      agentContext: {} as unknown as CommandContext['agentContext'],
      settings: {} as CommandContext['settings'],
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };

    const result = await command.execute(context, []);

    expect(result.data).toContain('Gemini client is not available');
  });
});
