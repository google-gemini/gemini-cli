/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CompressionStatus,
  type ChatCompressionInfo,
  type GeminiClient,
} from '@google/gemini-cli-core';
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
} from 'vitest';
import { compressCommand } from './compressCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

describe('compressCommand', () => {
  let context: ReturnType<typeof createMockCommandContext>;
  let mockTryCompressChat: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    mockTryCompressChat = vi.fn();
    context = createMockCommandContext({
      services: {
        config: {
          getGeminiClient: () =>
            ({
              tryCompressChat: mockTryCompressChat,
            }) as unknown as GeminiClient,
        },
      },
    });
  });

  it('should do nothing if a compression is already pending', async () => {
    context.ui.pendingItem = {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        originalTokenCount: null,
        newTokenCount: null,
        compressionStatus: null,
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
    const compressedResult: ChatCompressionInfo = {
      originalTokenCount: 200,
      compressionStatus: CompressionStatus.COMPRESSED,
      newTokenCount: 100,
    };
    mockTryCompressChat.mockResolvedValue(compressedResult);

    await compressCommand.action!(context, '');

    expect(context.ui.setPendingItem).toHaveBeenNthCalledWith(1, {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        compressionStatus: null,
        originalTokenCount: null,
        newTokenCount: null,
      },
    });

    expect(mockTryCompressChat).toHaveBeenCalledWith(
      expect.stringMatching(/^compress-\d+$/),
      true,
      { instructions: '' },
    );

    expect(context.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.COMPRESSION,
        compression: {
          isPending: false,
          compressionStatus: CompressionStatus.COMPRESSED,
          originalTokenCount: 200,
          newTokenCount: 100,
        },
      },
      expect.any(Number),
    );

    expect(context.ui.setPendingItem).toHaveBeenNthCalledWith(2, null);
  });

  it('should pass instructions to tryCompressChat', async () => {
    const compressedResult = {
      originalTokenCount: 200,
      newTokenCount: 100,
    };
    mockTryCompressChat.mockResolvedValue(compressedResult);

    await compressCommand.action!(context, 'test instruction');

    const [promptId, useHistory, params] = mockTryCompressChat.mock.calls[0];
    expect(promptId).toMatch(/^compress-\d+$/);
    expect(useHistory).toBe(true);
    expect(params).toEqual({ instructions: 'test instruction' });
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
});
