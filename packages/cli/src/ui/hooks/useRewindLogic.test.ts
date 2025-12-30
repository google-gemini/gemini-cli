/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useRewindLogic } from './useRewindLogic.js';
import * as rewindFileOps from '../utils/rewindFileOps.js';
import type { FileChangeStats } from '../utils/rewindFileOps.js';
import type {
  ConversationRecord,
  MessageRecord,
} from '@google/gemini-cli-core';

// Mock the dependency
vi.mock('../utils/rewindFileOps.js', () => ({
  calculateTurnStats: vi.fn(),
  calculateRewindImpact: vi.fn(),
}));

describe('useRewindLogic', () => {
  const mockUserMessage: MessageRecord = {
    id: 'msg-1',
    type: 'user',
    content: 'Hello',
    timestamp: new Date(1000).toISOString(),
  };

  const mockModelMessage: MessageRecord = {
    id: 'msg-2',
    type: 'gemini',
    content: 'Hi there',
    timestamp: new Date(1001).toISOString(),
  };

  const mockConversation: ConversationRecord = {
    sessionId: 'conv-1',
    projectHash: 'hash-1',
    startTime: new Date(1000).toISOString(),
    lastUpdated: new Date(1001).toISOString(),
    messages: [mockUserMessage, mockModelMessage],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should filter interactions to only include user messages', () => {
    const { result } = renderHook(() => useRewindLogic(mockConversation));

    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]).toEqual(mockUserMessage);
  });

  it('should initialize with no selection', () => {
    const { result } = renderHook(() => useRewindLogic(mockConversation));

    expect(result.current.selectedMessageId).toBeNull();
    expect(result.current.confirmationStats).toBeNull();
  });

  it('should update state when a message is selected', () => {
    const mockStats: FileChangeStats = {
      fileCount: 1,
      addedLines: 5,
      removedLines: 0,
      firstFileName: 'file.ts',
    };
    vi.mocked(rewindFileOps.calculateRewindImpact).mockReturnValue(mockStats);

    const { result } = renderHook(() => useRewindLogic(mockConversation));

    act(() => {
      result.current.selectMessage('msg-1');
    });

    expect(result.current.selectedMessageId).toBe('msg-1');
    expect(result.current.confirmationStats).toEqual(mockStats);
    expect(rewindFileOps.calculateRewindImpact).toHaveBeenCalledWith(
      mockConversation,
      mockUserMessage,
    );
  });

  it('should not update state if selected message is not found', () => {
    const { result } = renderHook(() => useRewindLogic(mockConversation));

    act(() => {
      result.current.selectMessage('non-existent-id');
    });

    expect(result.current.selectedMessageId).toBeNull();
    expect(result.current.confirmationStats).toBeNull();
  });

  it('should clear selection correctly', () => {
    const mockStats: FileChangeStats = {
      fileCount: 1,
      addedLines: 5,
      removedLines: 0,
      firstFileName: 'file.ts',
    };
    vi.mocked(rewindFileOps.calculateRewindImpact).mockReturnValue(mockStats);

    const { result } = renderHook(() => useRewindLogic(mockConversation));

    // Select first
    act(() => {
      result.current.selectMessage('msg-1');
    });
    expect(result.current.selectedMessageId).toBe('msg-1');

    // Then clear
    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedMessageId).toBeNull();
    expect(result.current.confirmationStats).toBeNull();
  });

  it('should proxy getStats call to utility function', () => {
    const mockStats: FileChangeStats = {
      fileCount: 2,
      addedLines: 10,
      removedLines: 2,
      firstFileName: 'file.ts',
    };
    vi.mocked(rewindFileOps.calculateTurnStats).mockReturnValue(mockStats);

    const { result } = renderHook(() => useRewindLogic(mockConversation));

    const stats = result.current.getStats(mockUserMessage);

    expect(stats).toEqual(mockStats);
    expect(rewindFileOps.calculateTurnStats).toHaveBeenCalledWith(
      mockConversation,
      mockUserMessage,
    );
  });
});
