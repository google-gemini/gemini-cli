/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useSessionResume } from './useSessionResume.js';
import type {
  Config,
  ResumedSessionData,
  ConversationRecord,
  MessageRecord,
} from '@google/gemini-cli-core';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import type { HistoryItemWithoutId } from '../types.js';

describe('useSessionResume', () => {
  // Mock dependencies
  const mockGeminiClient = {
    resumeChat: vi.fn(),
  };

  const mockConfig = {
    getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
  };

  const createMockHistoryManager = (): UseHistoryManagerReturn => ({
    history: [],
    addItem: vi.fn(),
    updateItem: vi.fn(),
    clearItems: vi.fn(),
    loadHistory: vi.fn(),
  });

  let mockHistoryManager: UseHistoryManagerReturn;

  const mockRefreshStatic = vi.fn();
  const mockSetQuittingMessages = vi.fn();

  const getDefaultProps = () => ({
    config: mockConfig as unknown as Config,
    historyManager: mockHistoryManager,
    refreshStatic: mockRefreshStatic,
    isGeminiClientInitialized: true,
    setQuittingMessages: mockSetQuittingMessages,
    resumedSessionData: undefined,
    isAuthenticating: false,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockHistoryManager = createMockHistoryManager();
  });

  describe('loadHistoryForResume', () => {
    it('should return a loadHistoryForResume callback', () => {
      const { result } = renderHook(() => useSessionResume(getDefaultProps()));

      expect(result.current.loadHistoryForResume).toBeInstanceOf(Function);
    });

    it('should clear history and add items when loading history', () => {
      const { result } = renderHook(() => useSessionResume(getDefaultProps()));

      const uiHistory: HistoryItemWithoutId[] = [
        { type: 'user', text: 'Hello' },
        { type: 'gemini', text: 'Hi there!' },
      ];

      const clientHistory = [
        { role: 'user' as const, parts: [{ text: 'Hello' }] },
        { role: 'model' as const, parts: [{ text: 'Hi there!' }] },
      ];

      const resumedData: ResumedSessionData = {
        conversation: {
          sessionId: 'test-123',
          projectHash: 'project-123',
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T01:00:00Z',
          messages: [] as MessageRecord[],
        },
        filePath: '/path/to/session.json',
      };

      act(() => {
        result.current.loadHistoryForResume(
          uiHistory,
          clientHistory,
          resumedData,
        );
      });

      expect(mockSetQuittingMessages).toHaveBeenCalledWith(null);
      expect(mockHistoryManager.clearItems).toHaveBeenCalled();
      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(2);
      expect(mockHistoryManager.addItem).toHaveBeenNthCalledWith(
        1,
        { type: 'user', text: 'Hello' },
        0,
        true,
      );
      expect(mockHistoryManager.addItem).toHaveBeenNthCalledWith(
        2,
        { type: 'gemini', text: 'Hi there!' },
        1,
        true,
      );
      expect(mockRefreshStatic).toHaveBeenCalled();
      expect(mockGeminiClient.resumeChat).toHaveBeenCalledWith(
        clientHistory,
        resumedData,
      );
    });

    it('should not load history if Gemini client is not initialized', () => {
      const { result } = renderHook(() =>
        useSessionResume({
          ...getDefaultProps(),
          isGeminiClientInitialized: false,
        }),
      );

      const uiHistory: HistoryItemWithoutId[] = [
        { type: 'user', text: 'Hello' },
      ];
      const clientHistory = [
        { role: 'user' as const, parts: [{ text: 'Hello' }] },
      ];
      const resumedData: ResumedSessionData = {
        conversation: {
          sessionId: 'test-123',
          projectHash: 'project-123',
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T01:00:00Z',
          messages: [] as MessageRecord[],
        },
        filePath: '/path/to/session.json',
      };

      act(() => {
        result.current.loadHistoryForResume(
          uiHistory,
          clientHistory,
          resumedData,
        );
      });

      expect(mockHistoryManager.clearItems).not.toHaveBeenCalled();
      expect(mockHistoryManager.addItem).not.toHaveBeenCalled();
      expect(mockGeminiClient.resumeChat).not.toHaveBeenCalled();
    });

    it('should handle empty history arrays', () => {
      const { result } = renderHook(() => useSessionResume(getDefaultProps()));

      const resumedData: ResumedSessionData = {
        conversation: {
          sessionId: 'test-123',
          projectHash: 'project-123',
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T01:00:00Z',
          messages: [] as MessageRecord[],
        },
        filePath: '/path/to/session.json',
      };

      act(() => {
        result.current.loadHistoryForResume([], [], resumedData);
      });

      expect(mockHistoryManager.clearItems).toHaveBeenCalled();
      expect(mockHistoryManager.addItem).not.toHaveBeenCalled();
      expect(mockRefreshStatic).toHaveBeenCalled();
      expect(mockGeminiClient.resumeChat).toHaveBeenCalledWith([], resumedData);
    });
  });

  describe('callback stability', () => {
    it('should maintain stable loadHistoryForResume reference across renders', () => {
      const { result, rerender } = renderHook(() =>
        useSessionResume(getDefaultProps()),
      );

      const initialCallback = result.current.loadHistoryForResume;

      rerender();

      expect(result.current.loadHistoryForResume).toBe(initialCallback);
    });

    it('should update callback when config changes', () => {
      const { result, rerender } = renderHook(
        ({ config }: { config: Config }) =>
          useSessionResume({
            ...getDefaultProps(),
            config,
          }),
        {
          initialProps: { config: mockConfig as unknown as Config },
        },
      );

      const initialCallback = result.current.loadHistoryForResume;

      const newMockConfig = {
        getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      };

      rerender({ config: newMockConfig as unknown as Config });

      expect(result.current.loadHistoryForResume).not.toBe(initialCallback);
    });
  });

  describe('automatic resume on mount', () => {
    it('should not resume when resumedSessionData is not provided', () => {
      renderHook(() => useSessionResume(getDefaultProps()));

      expect(mockHistoryManager.clearItems).not.toHaveBeenCalled();
      expect(mockHistoryManager.addItem).not.toHaveBeenCalled();
      expect(mockGeminiClient.resumeChat).not.toHaveBeenCalled();
    });

    it('should not resume when user is authenticating', () => {
      const conversation: ConversationRecord = {
        sessionId: 'auto-resume-123',
        projectHash: 'project-123',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          {
            id: 'msg-1',
            timestamp: '2025-01-01T00:01:00Z',
            content: 'Test message',
            type: 'user',
          },
        ] as MessageRecord[],
      };

      renderHook(() =>
        useSessionResume({
          ...getDefaultProps(),
          resumedSessionData: {
            conversation,
            filePath: '/path/to/session.json',
          },
          isAuthenticating: true,
        }),
      );

      expect(mockHistoryManager.clearItems).not.toHaveBeenCalled();
      expect(mockHistoryManager.addItem).not.toHaveBeenCalled();
      expect(mockGeminiClient.resumeChat).not.toHaveBeenCalled();
    });

    it('should not resume when Gemini client is not initialized', () => {
      const conversation: ConversationRecord = {
        sessionId: 'auto-resume-123',
        projectHash: 'project-123',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          {
            id: 'msg-1',
            timestamp: '2025-01-01T00:01:00Z',
            content: 'Test message',
            type: 'user',
          },
        ] as MessageRecord[],
      };

      renderHook(() =>
        useSessionResume({
          ...getDefaultProps(),
          resumedSessionData: {
            conversation,
            filePath: '/path/to/session.json',
          },
          isGeminiClientInitialized: false,
        }),
      );

      expect(mockHistoryManager.clearItems).not.toHaveBeenCalled();
      expect(mockHistoryManager.addItem).not.toHaveBeenCalled();
      expect(mockGeminiClient.resumeChat).not.toHaveBeenCalled();
    });

    it('should automatically resume session when resumedSessionData is provided', async () => {
      const conversation: ConversationRecord = {
        sessionId: 'auto-resume-123',
        projectHash: 'project-123',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          {
            id: 'msg-1',
            timestamp: '2025-01-01T00:01:00Z',
            content: 'Hello from resumed session',
            type: 'user',
          },
          {
            id: 'msg-2',
            timestamp: '2025-01-01T00:02:00Z',
            content: 'Welcome back!',
            type: 'gemini',
          },
        ] as MessageRecord[],
      };

      renderHook(() =>
        useSessionResume({
          ...getDefaultProps(),
          resumedSessionData: {
            conversation,
            filePath: '/path/to/session.json',
          },
        }),
      );

      await waitFor(() => {
        expect(mockHistoryManager.clearItems).toHaveBeenCalled();
      });

      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(2);
      expect(mockHistoryManager.addItem).toHaveBeenNthCalledWith(
        1,
        { type: 'user', text: 'Hello from resumed session' },
        0,
        true,
      );
      expect(mockHistoryManager.addItem).toHaveBeenNthCalledWith(
        2,
        { type: 'gemini', text: 'Welcome back!' },
        1,
        true,
      );
      expect(mockGeminiClient.resumeChat).toHaveBeenCalled();
    });

    it('should only resume once even if props change', async () => {
      const conversation: ConversationRecord = {
        sessionId: 'auto-resume-123',
        projectHash: 'project-123',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          {
            id: 'msg-1',
            timestamp: '2025-01-01T00:01:00Z',
            content: 'Test message',
            type: 'user',
          },
        ] as MessageRecord[],
      };

      const { rerender } = renderHook(
        ({ refreshStatic }: { refreshStatic: () => void }) =>
          useSessionResume({
            ...getDefaultProps(),
            refreshStatic,
            resumedSessionData: {
              conversation,
              filePath: '/path/to/session.json',
            },
          }),
        {
          initialProps: { refreshStatic: mockRefreshStatic },
        },
      );

      await waitFor(() => {
        expect(mockHistoryManager.clearItems).toHaveBeenCalled();
      });

      const clearItemsCallCount = (
        mockHistoryManager.clearItems as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      // Rerender with different refreshStatic
      const newRefreshStatic = vi.fn();
      rerender({ refreshStatic: newRefreshStatic });

      // Should not resume again
      expect(mockHistoryManager.clearItems).toHaveBeenCalledTimes(
        clearItemsCallCount,
      );
    });

    it('should convert session messages correctly during auto-resume', async () => {
      const conversation: ConversationRecord = {
        sessionId: 'auto-resume-with-tools',
        projectHash: 'project-123',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          {
            id: 'msg-1',
            timestamp: '2025-01-01T00:01:00Z',
            content: '/help',
            type: 'user',
          },
          {
            id: 'msg-2',
            timestamp: '2025-01-01T00:02:00Z',
            content: 'Regular message',
            type: 'user',
          },
        ] as MessageRecord[],
      };

      renderHook(() =>
        useSessionResume({
          ...getDefaultProps(),
          resumedSessionData: {
            conversation,
            filePath: '/path/to/session.json',
          },
        }),
      );

      await waitFor(() => {
        expect(mockGeminiClient.resumeChat).toHaveBeenCalled();
      });

      // Check that the client history was called with filtered messages
      // (slash commands should be filtered out)
      const clientHistory = mockGeminiClient.resumeChat.mock.calls[0][0];

      // Should only have the non-slash-command message
      expect(clientHistory).toHaveLength(1);
      expect(clientHistory[0]).toEqual({
        role: 'user',
        parts: [{ text: 'Regular message' }],
      });

      // But UI history should have both
      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(2);
    });
  });
});
