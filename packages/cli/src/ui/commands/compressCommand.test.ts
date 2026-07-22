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
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { compressCommand, abortActiveCompression } from './compressCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

describe('compressCommand', () => {
  let context: ReturnType<typeof createMockCommandContext>;
  let mockTryCompressChat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTryCompressChat = vi.fn();
    context = createMockCommandContext({
      services: {
        agentContext: {
          geminiClient: {
            tryCompressChat: mockTryCompressChat,
          } as unknown as GeminiClient,
        },
      },
    });
    // Reset any leftover abort controller from a previous test.
    abortActiveCompression();
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
    await new Promise((r) => setTimeout(r, 0));
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

  it('should set pending item, call tryCompressChat with AbortSignal, and add result on success', async () => {
    const compressedResult: ChatCompressionInfo = {
      originalTokenCount: 200,
      compressionStatus: CompressionStatus.COMPRESSED,
      newTokenCount: 100,
    };
    mockTryCompressChat.mockResolvedValue(compressedResult);

    await compressCommand.action!(context, '');
    await new Promise((r) => setTimeout(r, 0));

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
      expect.any(AbortSignal),
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

  it('should add an error message if tryCompressChat returns falsy', async () => {
    mockTryCompressChat.mockResolvedValue(null);

    await compressCommand.action!(context, '');
    await new Promise((r) => setTimeout(r, 0));

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
    await new Promise((r) => setTimeout(r, 0));

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
    await new Promise((r) => setTimeout(r, 0));
    expect(context.ui.setPendingItem).toHaveBeenCalledWith(null);
  });

  it('should silently bail out if aborted during compression', async () => {
    // Make tryCompressChat hang until we manually abort.
    let resolveCompress: (value: ChatCompressionInfo | null) => void;
    mockTryCompressChat.mockReturnValue(
      new Promise<ChatCompressionInfo | null>((resolve) => {
        resolveCompress = resolve;
      }),
    );

    await compressCommand.action!(context, '');

    // Abort while the compression is still in flight.
    abortActiveCompression();

    // Now let the promise resolve — the UI should NOT be updated with the result.
    resolveCompress!({
      originalTokenCount: 200,
      compressionStatus: CompressionStatus.COMPRESSED,
      newTokenCount: 100,
    });
    await new Promise((r) => setTimeout(r, 0));

    // addItem should NOT have been called with a COMPRESSION result
    // (only setPendingItem(null) in the finally block).
    const addItemCalls = (context.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls;
    const compressionResults = addItemCalls.filter(
      ([item]: [{ type: string }]) => item.type === MessageType.COMPRESSION,
    );
    expect(compressionResults).toHaveLength(0);
  });

  it('should swallow errors when aborted', async () => {
    // Make tryCompressChat reject after abort.
    mockTryCompressChat.mockImplementation(
      (_id: string, _force: boolean, signal: AbortSignal) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(
              new DOMException('The operation was aborted.', 'AbortError'),
            );
          });
        }),
    );

    await compressCommand.action!(context, '');
    abortActiveCompression();
    await new Promise((r) => setTimeout(r, 0));

    // No error item should be added.
    const addItemCalls = (context.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls;
    const errorItems = addItemCalls.filter(
      ([item]: [{ type: string }]) => item.type === MessageType.ERROR,
    );
    expect(errorItems).toHaveLength(0);
  });

  describe('metadata', () => {
    it('should have the correct name and aliases', () => {
      expect(compressCommand.name).toBe('compress');
      expect(compressCommand.altNames).toContain('summarize');
      expect(compressCommand.altNames).toContain('compact');
    });
  });
});
