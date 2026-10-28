/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
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
        agentContext: {
          geminiClient: {
            getChat: mockGetChat,
          },
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
      expect.anything(),
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

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'Part 1: Part 2: Part 3',
      expect.anything(),
    );
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

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'Text part more text',
      expect.anything(),
    );
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

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'Second AI response',
      expect.anything(),
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last output copied to the clipboard',
    });
  });

  it('should copy second-to-last AI message with /copy 2', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const history = [
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

    mockGetHistory.mockReturnValue(history);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyCommand.action(mockContext, '2');

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'First AI response',
      expect.anything(),
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Output #2 from last copied to the clipboard',
    });
  });

  it('should return info when index exceeds available AI messages', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const history = [
      {
        role: 'model',
        parts: [{ text: 'Only AI response' }],
      },
    ];

    mockGetHistory.mockReturnValue(history);

    const result = await copyCommand.action(mockContext, '3');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Only 1 AI response(s) in history.',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should return error for invalid index argument', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    mockGetHistory.mockReturnValue([]);

    const result = await copyCommand.action(mockContext, 'abc');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Invalid index. Usage: /copy or /copy <number> (e.g. /copy 2)',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should return error for zero or negative index', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    mockGetHistory.mockReturnValue([]);

    const result = await copyCommand.action(mockContext, '0');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Invalid index. Usage: /copy or /copy <number> (e.g. /copy 2)',
    });
  });

  it('should extract text from functionResponse parts', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const historyWithFunctionResponse = [
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              response: { output: 'Tool result text' },
            },
          },
        ],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithFunctionResponse);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyCommand.action(mockContext, '');

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'Tool result text',
      expect.anything(),
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last output copied to the clipboard',
    });
  });

  it('should handle falsy but valid functionResponse output values', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const historyWithZeroOutput = [
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              response: { output: 0 },
            },
          },
        ],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithZeroOutput);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyCommand.action(mockContext, '');

    expect(mockCopyToClipboard).toHaveBeenCalledWith('0', expect.anything());
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last output copied to the clipboard',
    });
  });

  it('should JSON.stringify object functionResponse output', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const historyWithObjectOutput = [
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              response: { output: { summary: 'video summary text' } },
            },
          },
        ],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithObjectOutput);
    mockCopyToClipboard.mockResolvedValue(undefined);

    const result = await copyCommand.action(mockContext, '');

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      JSON.stringify({ summary: 'video summary text' }),
      expect.anything(),
    );
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

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'AI response',
      expect.anything(),
    );
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

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      'AI response',
      expect.anything(),
    );
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
      content: 'AI output contains no text to copy.',
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('should handle unavailable config service', async () => {
    if (!copyCommand.action) throw new Error('Command has no action');

    const nullConfigContext = createMockCommandContext({
      services: { agentContext: null },
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
