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

  describe('editor subcommand', () => {
    const editorSubCommand = copyCommand.subCommands?.[0];

    it('should return info when no chat object is available', async () => {
      if (!editorSubCommand?.action)
        throw new Error('Editor subcommand has no action');

      mockGetChat.mockReturnValue(undefined);

      const result = await editorSubCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No chat history to open.',
      });
    });

    it('should return info when history is empty', async () => {
      if (!editorSubCommand?.action)
        throw new Error('Editor subcommand has no action');

      mockGetHistory.mockReturnValue([]);

      const result = await editorSubCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No chat history to open.',
      });
    });

    it('should return info when config is null', async () => {
      if (!editorSubCommand?.action)
        throw new Error('Editor subcommand has no action');

      const nullConfigContext = createMockCommandContext({
        services: { config: null },
      });

      const result = await editorSubCommand.action(nullConfigContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No chat history to open.',
      });
    });

    it('should format user and model messages with correct labels', async () => {
      if (!editorSubCommand?.action)
        throw new Error('Editor subcommand has no action');

      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: 'Hello there' }] },
        { role: 'model', parts: [{ text: 'Hi! How can I help?' }] },
      ]);

      const result = await editorSubCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'open_in_editor',
        content: 'User:\nHello there\n\n---\n\nModel:\nHi! How can I help?',
      });
    });

    it('should join multiple messages with separator', async () => {
      if (!editorSubCommand?.action)
        throw new Error('Editor subcommand has no action');

      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: 'First question' }] },
        { role: 'model', parts: [{ text: 'First answer' }] },
        { role: 'user', parts: [{ text: 'Second question' }] },
        { role: 'model', parts: [{ text: 'Second answer' }] },
      ]);

      const result = await editorSubCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'open_in_editor',
        content:
          'User:\nFirst question\n\n---\n\nModel:\nFirst answer\n\n---\n\nUser:\nSecond question\n\n---\n\nModel:\nSecond answer',
      });
    });

    it('should exclude thought parts from message content', async () => {
      if (!editorSubCommand?.action)
        throw new Error('Editor subcommand has no action');

      mockGetHistory.mockReturnValue([
        {
          role: 'model',
          parts: [
            { text: 'I am thinking...', thought: true },
            { text: 'Here is my answer.' },
          ],
        },
      ]);

      const result = await editorSubCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'open_in_editor',
        content: 'Model:\nHere is my answer.',
      });
    });

    it('should filter out messages that only contain thought parts', async () => {
      if (!editorSubCommand?.action)
        throw new Error('Editor subcommand has no action');

      mockGetHistory.mockReturnValue([
        { role: 'model', parts: [{ text: 'Just thinking...', thought: true }] },
        { role: 'user', parts: [{ text: 'A real question?' }] },
      ]);

      const result = await editorSubCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'open_in_editor',
        content: 'User:\nA real question?',
      });
    });

    it('should filter out system messages containing <session_context>', async () => {
      if (!editorSubCommand?.action)
        throw new Error('Editor subcommand has no action');

      mockGetHistory.mockReturnValue([
        {
          role: 'user',
          parts: [{ text: '<session_context>system stuff</session_context>' }],
        },
        { role: 'model', parts: [{ text: 'Real response' }] },
      ]);

      const result = await editorSubCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'open_in_editor',
        content: 'Model:\nReal response',
      });
    });

    it('should filter out messages containing both <user_input> and "Internal instruction:"', async () => {
      if (!editorSubCommand?.action)
        throw new Error('Editor subcommand has no action');

      mockGetHistory.mockReturnValue([
        {
          role: 'user',
          parts: [
            {
              text: '<user_input>Internal instruction: follow this rule</user_input>',
            },
          ],
        },
        { role: 'model', parts: [{ text: 'Acknowledged.' }] },
      ]);

      const result = await editorSubCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'open_in_editor',
        content: 'Model:\nAcknowledged.',
      });
    });

    it('should NOT filter out messages with <user_input> alone (no "Internal instruction:")', async () => {
      if (!editorSubCommand?.action)
        throw new Error('Editor subcommand has no action');

      mockGetHistory.mockReturnValue([
        {
          role: 'user',
          parts: [{ text: '<user_input>Normal user input</user_input>' }],
        },
        { role: 'model', parts: [{ text: 'Sure.' }] },
      ]);

      const result = await editorSubCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'open_in_editor',
        content:
          'User:\n<user_input>Normal user input</user_input>\n\n---\n\nModel:\nSure.',
      });
    });

    it('should return info when all messages are system messages', async () => {
      if (!editorSubCommand?.action)
        throw new Error('Editor subcommand has no action');

      mockGetHistory.mockReturnValue([
        {
          role: 'user',
          parts: [{ text: '<session_context>ctx</session_context>' }],
        },
        {
          role: 'user',
          parts: [
            {
              text: '<user_input>Internal instruction: do this</user_input>',
            },
          ],
        },
      ]);

      const result = await editorSubCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No output in history',
      });
    });
  });
});
