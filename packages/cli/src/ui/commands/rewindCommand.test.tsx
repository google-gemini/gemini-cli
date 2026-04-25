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
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
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
        agentContext: {
          geminiClient: {
            getChatRecordingService: mockGetChatRecordingService,
            setHistory: mockSetHistory,
            sendMessageStream: mockSendMessageStream,
          },
          config: {
            getSessionId: () => 'test-session-id',
            getMemoryContextManager: () => ({ refresh: mockResetContext }),
            getProjectRoot: mockGetProjectRoot,
          },
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

  it('should fail if config is missing', async () => {
    const context = { services: {} } as CommandContext;

    const result = await rewindCommand.action!(context, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Config not found',
    });
  });

  it('should fail if client is not initialized', async () => {
    const context = createMockCommandContext({
      services: {
        agentContext: {
          geminiClient: undefined,
          get config() {
            return this;
          },
        },
      },
    }) as unknown as CommandContext;

    const result = await rewindCommand.action!(context, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Client not initialized',
    });
  });

  it('should fail if recording service is unavailable', async () => {
    const context = createMockCommandContext({
      services: {
        agentContext: {
          geminiClient: { getChatRecordingService: () => undefined },
          get config() {
            return this;
          },
        },
      },
    }) as unknown as CommandContext;

    const result = await rewindCommand.action!(context, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Recording service unavailable',
    });
  });

  it('should return info if no conversation found', async () => {
    mockGetConversation.mockReturnValue(null);

    const result = await rewindCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No conversation found.',
    });
  });

  it('should return info if no user interactions found', async () => {
    mockGetConversation.mockReturnValue({
      messages: [{ id: 'msg-1', type: 'gemini', content: 'hello' }],
      sessionId: 'test-session',
    });

    const result = await rewindCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Nothing to rewind to.',
    });
  });

  describe('index-based rewind (/rewind <N>)', () => {
    beforeEach(() => {
      mockGetConversation.mockReturnValue({
        messages: [
          { id: 'msg-u1', type: 'user', content: 'first prompt' },
          { id: 'msg-g1', type: 'gemini', content: 'response 1' },
          { id: 'msg-u2', type: 'user', content: 'second prompt' },
          { id: 'msg-g2', type: 'gemini', content: 'response 2' },
          { id: 'msg-u3', type: 'user', content: 'third prompt' },
          { id: 'msg-g3', type: 'gemini', content: 'response 3' },
        ],
        sessionId: 'test-session',
      });
    });

    it('should rewind to the first user message with /rewind 0', async () => {
      const result = await rewindCommand.action!(mockContext, '0');

      expect(mockRewindTo).toHaveBeenCalledWith('msg-u1');
      expect(mockSetHistory).toHaveBeenCalled();
      expect(mockLoadHistory).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Rewound to before user message 0.',
      });
    });

    it('should rewind to the second user message with /rewind 1', async () => {
      const result = await rewindCommand.action!(mockContext, '1');

      expect(mockRewindTo).toHaveBeenCalledWith('msg-u2');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Rewound to before user message 1.',
      });
    });

    it('should resolve negative index: /rewind -1 targets last user message', async () => {
      const result = await rewindCommand.action!(mockContext, '-1');

      expect(mockRewindTo).toHaveBeenCalledWith('msg-u3');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Rewound to before user message 2.',
      });
    });

    it('should resolve negative index: /rewind -2 targets second-to-last', async () => {
      const result = await rewindCommand.action!(mockContext, '-2');

      expect(mockRewindTo).toHaveBeenCalledWith('msg-u2');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Rewound to before user message 1.',
      });
    });

    it('should return error for non-integer argument', async () => {
      const result = await rewindCommand.action!(mockContext, 'abc');

      expect(mockRewindTo).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content:
          'Invalid argument. Usage: /rewind <index> (integer, supports negative indexing)',
      });
    });

    it('should return error for out-of-range positive index', async () => {
      const result = await rewindCommand.action!(mockContext, '999');

      expect(mockRewindTo).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Invalid index. Valid range: 0 to 2 (or -3 to -1).',
      });
    });

    it('should return error for out-of-range negative index', async () => {
      const result = await rewindCommand.action!(mockContext, '-999');

      expect(mockRewindTo).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Invalid index. Valid range: 0 to 2 (or -3 to -1).',
      });
    });

    it('should not return success message when rewind fails', async () => {
      mockRewindTo.mockReturnValue(null);

      const result = await rewindCommand.action!(mockContext, '0');

      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'Could not fetch conversation file',
      );
      expect(result).toBeUndefined();
    });
  });
});
