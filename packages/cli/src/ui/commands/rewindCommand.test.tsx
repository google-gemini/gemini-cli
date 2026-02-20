/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rewindCommand } from './rewindCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { waitFor } from '../../test-utils/async.js';
import { RewindOutcome } from '../components/RewindConfirmation.js';
import {
  type OpenCustomDialogActionReturn,
  type CommandContext,
} from './types.js';
import type { ReactElement } from 'react';
import { coreEvents } from '@google/gemini-cli-core';

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
const mockSetInput = vi.fn();
const mockRevertFileChanges = vi.fn();
const mockGetProjectRoot = vi.fn().mockReturnValue('/mock/root');

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    coreEvents: {
      ...actual.coreEvents,
      emitFeedback: vi.fn(),
    },
    logRewind: vi.fn(),
    RewindEvent: class {},
  };
});

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

vi.mock('../utils/rewindFileOps.js', () => ({
  revertFileChanges: (...args: unknown[]) => mockRevertFileChanges(...args),
}));

interface RewindViewerProps {
  onRewind: (
    messageId: string,
    newText: string,
    outcome: RewindOutcome,
  ) => Promise<void>;
  conversation: unknown;
  onExit: () => void;
}

describe('rewindCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetConversation.mockReturnValue({
      messages: [{ id: 'msg-1', type: 'user', content: 'hello' }],
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
          getContextManager: () => ({ refresh: mockResetContext }),
          getProjectRoot: mockGetProjectRoot,
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
    const result = await rewindCommand.action!(mockContext, '');
    expect(result).toHaveProperty('type', 'custom_dialog');
  });

  it('should handle RewindOnly correctly', async () => {
    // 1. Run the command to get the component
    const result = (await rewindCommand.action!(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;
    const component = result.component as ReactElement<RewindViewerProps>;

    // Access onRewind from props
    const onRewind = component.props.onRewind;
    expect(onRewind).toBeDefined();

    await onRewind('msg-id-123', 'New Prompt', RewindOutcome.RewindOnly);

    await waitFor(() => {
      expect(mockRevertFileChanges).not.toHaveBeenCalled();
      expect(mockRewindTo).toHaveBeenCalledWith('msg-id-123');
      expect(mockSetHistory).toHaveBeenCalled();
      expect(mockResetContext).toHaveBeenCalled();
      expect(mockLoadHistory).toHaveBeenCalledWith(
        [
          expect.objectContaining({ text: 'old user', id: 1 }),
          expect.objectContaining({ text: 'old gemini', id: 2 }),
        ],
        'New Prompt',
      );
      expect(mockRemoveComponent).toHaveBeenCalled();
    });

    // Verify setInput was NOT called directly (it's handled via loadHistory now)
    expect(mockSetInput).not.toHaveBeenCalled();
  });

  it('should handle RewindAndRevert correctly', async () => {
    const result = (await rewindCommand.action!(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;
    const component = result.component as ReactElement<RewindViewerProps>;
    const onRewind = component.props.onRewind;

    await onRewind('msg-id-123', 'New Prompt', RewindOutcome.RewindAndRevert);

    await waitFor(() => {
      expect(mockRevertFileChanges).toHaveBeenCalledWith(
        mockGetConversation(),
        'msg-id-123',
      );
      expect(mockRewindTo).toHaveBeenCalledWith('msg-id-123');
      expect(mockLoadHistory).toHaveBeenCalledWith(
        expect.any(Array),
        'New Prompt',
      );
    });
    expect(mockSetInput).not.toHaveBeenCalled();
  });

  it('should handle RevertOnly correctly', async () => {
    const result = (await rewindCommand.action!(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;
    const component = result.component as ReactElement<RewindViewerProps>;
    const onRewind = component.props.onRewind;

    await onRewind('msg-id-123', 'New Prompt', RewindOutcome.RevertOnly);

    await waitFor(() => {
      expect(mockRevertFileChanges).toHaveBeenCalledWith(
        mockGetConversation(),
        'msg-id-123',
      );
      expect(mockRewindTo).not.toHaveBeenCalled();
      expect(mockRemoveComponent).toHaveBeenCalled();
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'info',
        'File changes reverted.',
      );
    });
    expect(mockSetInput).not.toHaveBeenCalled();
  });

  it('should handle Cancel correctly', async () => {
    const result = (await rewindCommand.action!(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;
    const component = result.component as ReactElement<RewindViewerProps>;
    const onRewind = component.props.onRewind;

    await onRewind('msg-id-123', 'New Prompt', RewindOutcome.Cancel);

    await waitFor(() => {
      expect(mockRevertFileChanges).not.toHaveBeenCalled();
      expect(mockRewindTo).not.toHaveBeenCalled();
      expect(mockRemoveComponent).toHaveBeenCalled();
    });
    expect(mockSetInput).not.toHaveBeenCalled();
  });

  it('should handle onExit correctly', async () => {
    const result = (await rewindCommand.action!(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;
    const component = result.component as ReactElement<RewindViewerProps>;
    const onExit = component.props.onExit;

    onExit();

    expect(mockRemoveComponent).toHaveBeenCalled();
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

    await onRewind('msg-1', 'Prompt', RewindOutcome.RewindOnly);

    await waitFor(() => {
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'Rewind Failed',
      );
    });
  });

  it('should handle null conversation from rewindTo', async () => {
    const result = (await rewindCommand.action!(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;
    const component = result.component as ReactElement<RewindViewerProps>;
    const onRewind = component.props.onRewind;

    mockRewindTo.mockReturnValue(null);

    await onRewind('msg-1', 'Prompt', RewindOutcome.RewindOnly);

    await waitFor(() => {
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'Could not fetch conversation file',
      );
      expect(mockRemoveComponent).toHaveBeenCalled();
    });
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

  it('should return info if no user interactions found', () => {
    mockGetConversation.mockReturnValue({
      messages: [{ id: 'msg-1', type: 'gemini', content: 'hello' }],
      sessionId: 'test-session',
    });

    const result = rewindCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Nothing to rewind to.',
    });
  });
});
