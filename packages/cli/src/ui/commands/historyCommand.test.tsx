/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { historyCommand } from './historyCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import {
  type OpenCustomDialogActionReturn,
  type CommandContext,
} from './types.js';
import { GeminiEventType } from '@google/gemini-cli-core';
import type { ReactElement } from 'react';

// Mock dependencies
const mockRewindTo = vi.fn();
const mockRecordMessage = vi.fn();
const mockSetHistory = vi.fn();
const mockSendMessageStream = vi.fn();
const mockGetChatRecordingService = vi.fn();
const mockGetConversation = vi.fn();
const mockRemoveComponent = vi.fn();
const mockLoadHistory = vi.fn();
const mockAddItem = vi.fn();
const mockSetPendingItem = vi.fn();

vi.mock('../components/HistoryViewer.js', () => ({
  HistoryViewer: () => null,
}));

vi.mock('../hooks/useSessionBrowser.js', () => ({
  convertSessionToHistoryFormats: vi.fn().mockReturnValue({
    uiHistory: [
      { type: 'user', text: 'old user' },
      { type: 'gemini', text: 'old gemini' },
    ],
    clientHistory: [{ role: 'user', parts: [{ text: 'old user' }] }],
  }),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    GeminiEventType: {
      Content: 'content',
      Finished: 'finished',
      Error: 'error',
    },
  };
});

interface HistoryViewerProps {
  onRewind: (
    messageId: string,
    newText: string,
    promptCount?: number,
  ) => Promise<void>;
  conversation: unknown;
  onExit: () => void;
}

describe('historyCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetConversation.mockReturnValue({
      messages: [],
      sessionId: 'test-session',
    });

    mockRewindTo.mockReturnValue({
      messages: [], // Mocked rewound messages
    });

    mockGetChatRecordingService.mockReturnValue({
      getConversation: mockGetConversation,
      rewindTo: mockRewindTo,
      recordMessage: mockRecordMessage,
    });

    mockContext = createMockCommandContext({
      services: {
        config: {
          getGeminiClient: () => ({
            getChatRecordingService: mockGetChatRecordingService,
            setHistory: mockSetHistory,
            sendMessageStream: mockSendMessageStream,
          }),
          getSessionId: () => 'test-session-id',
        },
      },
      ui: {
        removeComponent: mockRemoveComponent,
        loadHistory: mockLoadHistory,
        addItem: mockAddItem,
        setPendingItem: mockSetPendingItem,
      },
    }) as unknown as CommandContext;
  });

  it('should initialize successfully', async () => {
    const result = await historyCommand.action!(mockContext, '');
    expect(result).toHaveProperty('type', 'custom_dialog');
  });

  it('should handle onRewind correctly', async () => {
    // 1. Run the command to get the component
    const result = (await historyCommand.action!(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;
    const component = result.component as ReactElement<HistoryViewerProps>;

    // Access onRewind from props
    const onRewind = component.props.onRewind;

    expect(onRewind).toBeDefined();

    // 2. Mock stream response

    async function* streamGenerator() {
      yield { type: GeminiEventType.Content, value: 'New ' };
      yield { type: GeminiEventType.Content, value: 'Response' };
      yield { type: GeminiEventType.Finished };
    }

    mockSendMessageStream.mockReturnValue(streamGenerator());
    await onRewind('msg-id-123', 'New Prompt');
    expect(mockRewindTo).toHaveBeenCalledWith('msg-id-123');
    expect(mockSetHistory).toHaveBeenCalled();
    expect(mockLoadHistory).toHaveBeenCalled();
    expect(mockRemoveComponent).toHaveBeenCalled();

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.USER,

        text: 'New Prompt',
      }),

      expect.any(Number),
    );

    expect(mockSetPendingItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: MessageType.GEMINI, text: '' }),
    );
    expect(mockSetPendingItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: MessageType.GEMINI, text: 'New ' }),
    );
    expect(mockSetPendingItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.GEMINI,
        text: 'New Response',
      }),
    );

    expect(mockSetPendingItem).toHaveBeenCalledWith(null);

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.GEMINI,

        text: 'New Response',
      }),
      expect.any(Number),
    );
  });

  it('should handle stream error correctly', async () => {
    const result = (await historyCommand.action!(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;
    const component = result.component as ReactElement<HistoryViewerProps>;
    const onRewind = component.props.onRewind;

    async function* errorStreamGenerator() {
      yield { type: GeminiEventType.Content, value: 'Partial' };

      yield {
        type: GeminiEventType.Error,
        value: { error: { message: 'Stream Failed' } },
      };
    }

    mockSendMessageStream.mockReturnValue(errorStreamGenerator());

    await onRewind('msg-1', 'Prompt');

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,

        text: 'Stream Failed',
      }),

      expect.any(Number),
    );

    // Should still save the partial response if any?
    // Implementation: "if (fullResponseText)" -> adds Gemini message.
    // In this case "Partial" was received.

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.GEMINI,
        text: 'Partial',
      }),
      expect.any(Number),
    );
  });

  it('should fail if config is missing', () => {
    const context = { services: {} } as CommandContext;

    const result = historyCommand.action!(context, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Config not found',
    });
  });

  it('should fail if client is not initialized', () => {
    const context = createMockCommandContext({
      services: {
        config: { getGeminiClient: () => undefined },
      },
    }) as unknown as CommandContext;

    const result = historyCommand.action!(context, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Client not initialized',
    });
  });

  it('should fail if recording service is unavailable', () => {
    const context = createMockCommandContext({
      services: {
        config: {
          getGeminiClient: () => ({ getChatRecordingService: () => undefined }),
        },
      },
    }) as unknown as CommandContext;

    const result = historyCommand.action!(context, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Recording service unavailable',
    });
  });

  it('should return info if no conversation found', () => {
    mockGetConversation.mockReturnValue(null);

    const result = historyCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No conversation found.',
    });
  });
});
