/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rewindCommand } from './rewindCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import {
  type OpenCustomDialogActionReturn,
  type CommandContext,
} from './types.js';
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
const mockResetContext = vi.fn();
const mockSubmitPrompt = vi.fn();

vi.mock('../components/RewindViewer.js', () => ({
  RewindViewer: () => null,
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

interface RewindViewerProps {
  onRewind: (
    messageId: string,
    newText: string,
    promptCount?: number,
  ) => Promise<void>;
  conversation: unknown;
  onExit: () => void;
}

describe('rewindCommand', () => {
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
          getContextManager: () => ({ reset: mockResetContext }),
        },
      },
      ui: {
        removeComponent: mockRemoveComponent,
        loadHistory: mockLoadHistory,
        addItem: mockAddItem,
        setPendingItem: mockSetPendingItem,
        submitPrompt: mockSubmitPrompt,
      },
    }) as unknown as CommandContext;
  });

  it('should initialize successfully', async () => {
    const result = await rewindCommand.action!(mockContext, '');
    expect(result).toHaveProperty('type', 'custom_dialog');
  });

  it('should handle onRewind correctly', async () => {
    // 1. Run the command to get the component
    const result = (await rewindCommand.action!(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;
    const component = result.component as ReactElement<RewindViewerProps>;

    // Access onRewind from props
    const onRewind = component.props.onRewind;
    expect(onRewind).toBeDefined();

    await onRewind('msg-id-123', 'New Prompt');

    expect(mockRewindTo).toHaveBeenCalledWith('msg-id-123');
    expect(mockSetHistory).toHaveBeenCalled();
    expect(mockResetContext).toHaveBeenCalled();
    expect(mockLoadHistory).toHaveBeenCalledWith([
      expect.objectContaining({ text: 'old user', id: 1 }),
      expect.objectContaining({ text: 'old gemini', id: 2 }),
    ]);
    expect(mockRemoveComponent).toHaveBeenCalled();

    // Verify submitPrompt was called with the new text
    expect(mockSubmitPrompt).toHaveBeenCalledWith('New Prompt');

    // Verify manually handling the stream did NOT happen
    expect(mockSendMessageStream).not.toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.USER,
        text: 'New Prompt',
      }),
      expect.any(Number),
    );
  });

  it('should handle rewind error correctly', async () => {
    const result = (await rewindCommand.action!(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;
    const component = result.component as ReactElement<RewindViewerProps>;
    const onRewind = component.props.onRewind;

    mockRewindTo.mockImplementation(() => {
      throw new Error('Rewind Failed');
    });

    await onRewind('msg-1', 'Prompt');

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: 'Rewind Failed',
      }),
      expect.any(Number),
    );
  });

  it('should fail if config is missing', () => {
    const context = { services: {} } as CommandContext;

    const result = rewindCommand.action!(context, '');

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

    const result = rewindCommand.action!(context, '');

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

    const result = rewindCommand.action!(context, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Recording service unavailable',
    });
  });

  it('should return info if no conversation found', () => {
    mockGetConversation.mockReturnValue(null);

    const result = rewindCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No conversation found.',
    });
  });
});
