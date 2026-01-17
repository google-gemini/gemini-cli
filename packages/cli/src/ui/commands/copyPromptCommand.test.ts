/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { copyToClipboard } from '../utils/commandUtils.js';
import { copyPromptCommand } from './copyPromptCommand.js';
import { type CommandContext } from './types.js';

vi.mock('../utils/commandUtils.js', () => ({
  copyToClipboard: vi.fn(),
}));

describe('copyPromptCommand', () => {
  let mockContext: CommandContext;
  let mockCopyToClipboard: Mock;
  let mockGetChat: Mock;
  let mockGetHistory: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCopyToClipboard = vi.mocked(copyToClipboard);
    mockGetChat = vi.fn();
    mockGetHistory = vi.fn();

    mockContext = createMockCommandContext({
      services: {
        config: {
          getGeminiClient: () => ({
            getChat: mockGetChat,
          }),
        },
      },
    });

    mockGetChat.mockReturnValue({
      getHistory: mockGetHistory,
    });
  });

  it('should return info message when no history is available', async () => {
    if (!copyPromptCommand.action) throw new Error('Command has no action');

    mockGetChat.mockReturnValue(undefined);

    const result = await copyPromptCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No prompt in history',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should return info message when history is empty', async () => {
    if (!copyPromptCommand.action) throw new Error('Command has no action');

    mockGetHistory.mockReturnValue([]);

    const result = await copyPromptCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No prompt in history',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should return info message when no user messages are found in history', async () => {
    if (!copyPromptCommand.action) throw new Error('Command has no action');

    const historyWithModelOnly = [
      {
        role: 'model',
        parts: [{ text: 'Hello' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithModelOnly);

    const result = await copyPromptCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No prompt in history',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should copy last user message to clipboard successfully', async () => {
    if (!copyPromptCommand.action) throw new Error('Command has no action');

    const historyWithUserMessage = [
      {
        role: 'model',
        parts: [{ text: 'Hi there! How can I help you?' }],
      },
      {
        role: 'user',
        parts: [{ text: 'Hello' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithUserMessage);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyPromptCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last prompt copied to the clipboard',
    });

    expect(mockCopyToClipboard).toHaveBeenCalledWith('Hello');
  });

  it('should handle multiple text parts in user message', async () => {
    if (!copyPromptCommand.action) throw new Error('Command has no action');

    const historyWithMultipleParts = [
      {
        role: 'user',
        parts: [{ text: 'Part 1: ' }, { text: 'Part 2: ' }, { text: 'Part 3' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithMultipleParts);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyPromptCommand.action(mockContext, '');

    expect(mockCopyToClipboard).toHaveBeenCalledWith('Part 1: Part 2: Part 3');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last prompt copied to the clipboard',
    });
  });

  it('should filter out non-text parts', async () => {
    if (!copyPromptCommand.action) throw new Error('Command has no action');

    const historyWithMixedParts = [
      {
        role: 'user',
        parts: [
          { text: 'Text part' },
          { image: 'base64data' }, // Non-text part
          { text: ' more text' },
        ],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithMixedParts);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyPromptCommand.action(mockContext, '');

    expect(mockCopyToClipboard).toHaveBeenCalledWith('Text part more text');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last prompt copied to the clipboard',
    });
  });

  it('should get the last user message when multiple user messages exist', async () => {
    if (!copyPromptCommand.action) throw new Error('Command has no action');

    const historyWithMultipleUserMessages = [
      {
        role: 'user',
        parts: [{ text: 'First user message' }],
      },
      {
        role: 'model',
        parts: [{ text: 'AI response' }],
      },
      {
        role: 'user',
        parts: [{ text: 'Second user message' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithMultipleUserMessages);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyPromptCommand.action(mockContext, '');

    expect(mockCopyToClipboard).toHaveBeenCalledWith('Second user message');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last prompt copied to the clipboard',
    });
  });

  it('should handle clipboard copy error', async () => {
    if (!copyPromptCommand.action) throw new Error('Command has no action');

    const historyWithUserMessage = [
      {
        role: 'user',
        parts: [{ text: 'User prompt' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithUserMessage);
    const clipboardError = new Error('Clipboard access denied');
    mockCopyToClipboard.mockRejectedValue(clipboardError);

    const result = await copyPromptCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to copy to the clipboard.',
    });
  });

  it('should handle non-Error clipboard errors', async () => {
    if (!copyPromptCommand.action) throw new Error('Command has no action');

    const historyWithUserMessage = [
      {
        role: 'user',
        parts: [{ text: 'User prompt' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithUserMessage);
    mockCopyToClipboard.mockRejectedValue('String error');

    const result = await copyPromptCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to copy to the clipboard.',
    });
  });

  it('should return info message when no text parts found in user message', async () => {
    if (!copyPromptCommand.action) throw new Error('Command has no action');

    const historyWithEmptyParts = [
      {
        role: 'user',
        parts: [{ image: 'base64data' }], // No text parts
      },
    ];

    mockGetHistory.mockReturnValue(historyWithEmptyParts);

    const result = await copyPromptCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last prompt contains no text to copy.',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should handle unavailable config service', async () => {
    if (!copyPromptCommand.action) throw new Error('Command has no action');

    const nullConfigContext = createMockCommandContext({
      services: { config: null },
    });

    const result = await copyPromptCommand.action(nullConfigContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No prompt in history',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });
});
