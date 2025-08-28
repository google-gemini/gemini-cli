/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { copyCommand } from './copyCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { copyToClipboard } from '../utils/commandUtils.js';

vi.mock('../utils/commandUtils.js', () => ({
  copyToClipboard: vi.fn(),
}));

describe('copyCommand', () => {
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
    if (!copyCommand.action) throw new Error('Command has no action');

    mockGetChat.mockReturnValue(undefined);

    const result = await copyCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No output in history',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should return info message when history is empty', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    mockGetHistory.mockReturnValue([]);

    const result = await copyCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No output in history',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should return info message when no AI messages are found in history', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const historyWithUserOnly = [
      {
        role: 'user',
        parts: [{ text: 'Hello' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithUserOnly);

    const result = await copyCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No output in history',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should copy last AI message to clipboard successfully', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const historyWithAiMessage = [
      {
        role: 'user',
        parts: [{ text: 'Hello' }],
      },
      {
        role: 'model',
        parts: [{ text: 'Hi there! How can I help you?' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithAiMessage);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last output copied to the clipboard',
    });

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'Hi there! How can I help you?',
    );
  });

  it('should handle multiple text parts in AI message', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const historyWithMultipleParts = [
      {
        role: 'model',
        parts: [{ text: 'Part 1: ' }, { text: 'Part 2: ' }, { text: 'Part 3' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithMultipleParts);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyCommand.action(mockContext, '');

    expect(mockCopyToClipboard).toHaveBeenCalledWith('Part 1: Part 2: Part 3');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last output copied to the clipboard',
    });
  });

  it('should filter out non-text parts', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const historyWithMixedParts = [
      {
        role: 'model',
        parts: [
          { text: 'Text part' },
          { image: 'base64data' }, // Non-text part
          { text: ' more text' },
        ],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithMixedParts);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyCommand.action(mockContext, '');

    expect(mockCopyToClipboard).toHaveBeenCalledWith('Text part more text');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last output copied to the clipboard',
    });
  });

  it('should get the last AI message when multiple AI messages exist', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const historyWithMultipleAiMessages = [
      {
        role: 'model',
        parts: [{ text: 'First AI response' }],
      },
      {
        role: 'user',
        parts: [{ text: 'User message' }],
      },
      {
        role: 'model',
        parts: [{ text: 'Second AI response' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithMultipleAiMessages);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyCommand.action(mockContext, '');

    expect(mockCopyToClipboard).toHaveBeenCalledWith('Second AI response');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last output copied to the clipboard',
    });
  });

  it('should handle clipboard copy error', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const historyWithAiMessage = [
      {
        role: 'model',
        parts: [{ text: 'AI response' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithAiMessage);
    const clipboardError = new Error('Clipboard access denied');
    mockCopyToClipboard.mockRejectedValue(clipboardError);

    const result = await copyCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: `Failed to copy to the clipboard. ${clipboardError.message}`,
    });
  });

  it('should handle non-Error clipboard errors', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const historyWithAiMessage = [
      {
        role: 'model',
        parts: [{ text: 'AI response' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithAiMessage);
    const rejectedValue = 'String error';
    mockCopyToClipboard.mockRejectedValue(rejectedValue);

    const result = await copyCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: `Failed to copy to the clipboard. ${rejectedValue}`,
    });
  });

  it('should return info message when no text parts found in AI message', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const historyWithEmptyParts = [
      {
        role: 'model',
        parts: [{ image: 'base64data' }], // No text parts
      },
    ];

    mockGetHistory.mockReturnValue(historyWithEmptyParts);

    const result = await copyCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last AI output contains no text to copy.',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should handle unavailable config service', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const nullConfigContext = createMockCommandContext({
      services: { config: null },
    });

    const result = await copyCommand.action(nullConfigContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No output in history',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });
});
