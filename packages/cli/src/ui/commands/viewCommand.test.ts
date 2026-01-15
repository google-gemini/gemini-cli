/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { viewCommand } from './viewCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { isEditorAvailable, openInEditor } from '@google/gemini-cli-core';
import { writeFileSync, unlinkSync } from 'node:fs';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    isEditorAvailable: vi.fn(),
    openInEditor: vi.fn(),
  };
});

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe('viewCommand', () => {
  let mockContext: CommandContext;
  let mockIsEditorAvailable: Mock;
  let mockOpenInEditor: Mock;
  let mockWriteFileSync: Mock;
  let mockUnlinkSync: Mock;
  let mockGetChat: Mock;
  let mockGetHistory: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockIsEditorAvailable = vi.mocked(isEditorAvailable);
    mockOpenInEditor = vi.mocked(openInEditor);
    mockWriteFileSync = vi.mocked(writeFileSync);
    mockUnlinkSync = vi.mocked(unlinkSync);
    mockGetChat = vi.fn();
    mockGetHistory = vi.fn();

    mockContext = createMockCommandContext({
      services: {
        config: {
          getGeminiClient: () => ({
            getChat: mockGetChat,
          }),
        },
        settings: {
          merged: {
            general: {
              preferredEditor: 'vscode',
            },
          },
        },
      },
    });

    mockGetChat.mockReturnValue({
      getHistory: mockGetHistory,
    });
  });

  it('should return error when no editor is configured', async () => {
    if (!viewCommand.action) throw new Error('Command has no action');

    const noEditorContext = createMockCommandContext({
      services: {
        settings: {
          merged: {
            general: {
              preferredEditor: undefined,
            },
          },
        },
      },
    });

    const result = await viewCommand.action(noEditorContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        'No editor configured. Use /editor to set your preferred editor.',
    });
  });

  it('should return error when editor is not available', async () => {
    if (!viewCommand.action) throw new Error('Command has no action');

    mockIsEditorAvailable.mockReturnValue(false);

    const result = await viewCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        'No editor configured. Use /editor to set your preferred editor.',
    });
  });

  it('should return info message when no history is available', async () => {
    if (!viewCommand.action) throw new Error('Command has no action');

    mockIsEditorAvailable.mockReturnValue(true);
    mockGetChat.mockReturnValue(undefined);

    const result = await viewCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No output in history',
    });
  });

  it('should return info message when history is empty', async () => {
    if (!viewCommand.action) throw new Error('Command has no action');

    mockIsEditorAvailable.mockReturnValue(true);
    mockGetHistory.mockReturnValue([]);

    const result = await viewCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No output in history',
    });
  });

  it('should return info message when no AI messages are found in history', async () => {
    if (!viewCommand.action) throw new Error('Command has no action');

    mockIsEditorAvailable.mockReturnValue(true);
    const historyWithUserOnly = [
      {
        role: 'user',
        parts: [{ text: 'Hello' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithUserOnly);

    const result = await viewCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No output in history',
    });
  });

  it('should open last AI message in editor successfully', async () => {
    if (!viewCommand.action) throw new Error('Command has no action');

    mockIsEditorAvailable.mockReturnValue(true);
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
    mockOpenInEditor.mockResolvedValue(undefined);

    const result = await viewCommand.action(mockContext, '');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/gemini-output-\d+\.md$/),
      'Hi there! How can I help you?',
      'utf-8',
    );
    expect(mockOpenInEditor).toHaveBeenCalledWith(
      expect.stringMatching(/gemini-output-\d+\.md$/),
      'vscode',
    );
    expect(mockUnlinkSync).toHaveBeenCalledWith(
      expect.stringMatching(/gemini-output-\d+\.md$/),
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Opened last output in vscode',
    });
  });

  it('should handle multiple text parts in AI message', async () => {
    if (!viewCommand.action) throw new Error('Command has no action');

    mockIsEditorAvailable.mockReturnValue(true);
    const historyWithMultipleParts = [
      {
        role: 'model',
        parts: [{ text: 'Part 1: ' }, { text: 'Part 2: ' }, { text: 'Part 3' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithMultipleParts);
    mockOpenInEditor.mockResolvedValue(undefined);

    const result = await viewCommand.action(mockContext, '');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/gemini-output-\d+\.md$/),
      'Part 1: Part 2: Part 3',
      'utf-8',
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Opened last output in vscode',
    });
  });

  it('should get the last AI message when multiple AI messages exist', async () => {
    if (!viewCommand.action) throw new Error('Command has no action');

    mockIsEditorAvailable.mockReturnValue(true);
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
    mockOpenInEditor.mockResolvedValue(undefined);

    const result = await viewCommand.action(mockContext, '');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/gemini-output-\d+\.md$/),
      'Second AI response',
      'utf-8',
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Opened last output in vscode',
    });
  });

  it('should handle editor open error', async () => {
    if (!viewCommand.action) throw new Error('Command has no action');

    mockIsEditorAvailable.mockReturnValue(true);
    const historyWithAiMessage = [
      {
        role: 'model',
        parts: [{ text: 'AI response' }],
      },
    ];

    mockGetHistory.mockReturnValue(historyWithAiMessage);
    const editorError = new Error('Editor launch failed');
    mockOpenInEditor.mockRejectedValue(editorError);

    const result = await viewCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: `Failed to open in editor. ${editorError.message}`,
    });
  });

  it('should return info message when no text parts found in AI message', async () => {
    if (!viewCommand.action) throw new Error('Command has no action');

    mockIsEditorAvailable.mockReturnValue(true);
    const historyWithEmptyParts = [
      {
        role: 'model',
        parts: [{ image: 'base64data' }], // No text parts
      },
    ];

    mockGetHistory.mockReturnValue(historyWithEmptyParts);

    const result = await viewCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Last AI output contains no text to view.',
    });

    expect(mockOpenInEditor).not.toHaveBeenCalled();
  });

  it('should handle unavailable config service', async () => {
    if (!viewCommand.action) throw new Error('Command has no action');

    mockIsEditorAvailable.mockReturnValue(true);
    const nullConfigContext = createMockCommandContext({
      services: {
        config: null,
        settings: {
          merged: {
            general: {
              preferredEditor: 'vscode',
            },
          },
        },
      },
    });

    const result = await viewCommand.action(nullConfigContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No output in history',
    });

    expect(mockOpenInEditor).not.toHaveBeenCalled();
  });
});
