/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Core from '@google/gemini-cli-core';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { compressCommand } from './compressCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    tokenLimit: vi.fn(),
  };
});

describe('compressCommand', () => {
  let context: ReturnType<typeof createMockCommandContext>;
  let mockTryCompressChat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTryCompressChat = vi.fn();
    vi.mocked(Core.tokenLimit).mockReturnValue(1000);
    context = createMockCommandContext({
      services: {
        agentContext: {
          config: {
            getModel: () => 'test-model',
            getContextWindowCompressionThreshold: () => 0.2,
          },
          geminiClient: {
            tryCompressChat: mockTryCompressChat,
          } as unknown as Core.GeminiClient,
        },
      },
    });
  });

  it('should do nothing if a compression is already pending', async () => {
    context.ui.pendingItem = {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        beforePercentage: null,
        afterPercentage: null,
        compressionStatus: null,
        isManual: true,
      },
    };
    await compressCommand.action!(context, '');
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: 'Already compressing, wait for previous request to complete',
      }),
      expect.any(Number),
    );
    expect(context.ui.setPendingItem).not.toHaveBeenCalled();
    expect(mockTryCompressChat).not.toHaveBeenCalled();
  });

  it('should set pending item, call tryCompressChat, and add result on success', async () => {
    const compressedResult: Core.ChatCompressionInfo = {
      originalTokenCount: 200,
      compressionStatus: Core.CompressionStatus.COMPRESSED,
      newTokenCount: 100,
    };
    mockTryCompressChat.mockResolvedValue(compressedResult);

    await compressCommand.action!(context, '');

    expect(context.ui.setPendingItem).toHaveBeenNthCalledWith(1, {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        compressionStatus: null,
        beforePercentage: null,
        afterPercentage: null,
        isManual: true,
      },
    });

    expect(mockTryCompressChat).toHaveBeenCalledWith(
      expect.stringMatching(/^compress-\d+$/),
      true,
    );

    expect(context.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.COMPRESSION,
        compression: {
          isPending: false,
          compressionStatus: Core.CompressionStatus.COMPRESSED,
          beforePercentage: 20,
          afterPercentage: 10,
          isManual: true,
          thresholdPercentage: 20,
        },
      },
      expect.any(Number),
    );

    expect(context.ui.setPendingItem).toHaveBeenNthCalledWith(2, null);
  });

  it('should add an error message if tryCompressChat returns falsy', async () => {
    mockTryCompressChat.mockResolvedValue(null);

    await compressCommand.action!(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: 'Failed to compress chat history.',
      }),
      expect.any(Number),
    );
    expect(context.ui.setPendingItem).toHaveBeenCalledWith(null);
  });

  it('should add an error message if tryCompressChat throws', async () => {
    const error = new Error('Compression failed');
    mockTryCompressChat.mockRejectedValue(error);

    await compressCommand.action!(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: `Failed to compress chat history: ${error.message}`,
      }),
      expect.any(Number),
    );
    expect(context.ui.setPendingItem).toHaveBeenCalledWith(null);
  });

  it('should clear the pending item in a finally block', async () => {
    mockTryCompressChat.mockRejectedValue(new Error('some error'));
    await compressCommand.action!(context, '');
    expect(context.ui.setPendingItem).toHaveBeenCalledWith(null);
  });

  describe('metadata', () => {
    it('should have the correct name and aliases', () => {
      expect(compressCommand.name).toBe('compress');
      expect(compressCommand.altNames).toContain('summarize');
      expect(compressCommand.altNames).toContain('compact');
    });
  });
});
