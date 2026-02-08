/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { act } from 'react';
import { useMCPProgress } from './useMCPProgress.js';
import { coreEvents, CoreEvent } from '@google/gemini-cli-core';

describe('useMCPProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any lingering listeners
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useMCPProgress());
    expect(result.current.progressState).toEqual({});
  });

  it('should update state when progress event is received', () => {
    const { result } = renderHook(() => useMCPProgress());

    act(() => {
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-1',
        serverName: 'server',
        toolName: 'tool',
        progress: 50,
        total: 100,
        message: 'Processing...',
      });
    });

    expect(result.current.progressState).toEqual({
      'call-1': {
        progress: 50,
        total: 100,
        message: 'Processing...',
      },
    });
  });

  it('should track multiple concurrent tool calls', () => {
    const { result } = renderHook(() => useMCPProgress());

    act(() => {
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-1',
        serverName: 'server1',
        toolName: 'tool1',
        progress: 25,
      });
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-2',
        serverName: 'server2',
        toolName: 'tool2',
        progress: 75,
        total: 100,
      });
    });

    expect(result.current.progressState).toEqual({
      'call-1': { progress: 25, total: undefined, message: undefined },
      'call-2': { progress: 75, total: 100, message: undefined },
    });
  });

  it('should update existing progress for same callId', () => {
    const { result } = renderHook(() => useMCPProgress());

    act(() => {
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-1',
        serverName: 'server',
        toolName: 'tool',
        progress: 25,
      });
    });

    act(() => {
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-1',
        serverName: 'server',
        toolName: 'tool',
        progress: 75,
        message: 'Almost done',
      });
    });

    expect(result.current.progressState['call-1']).toEqual({
      progress: 75,
      total: undefined,
      message: 'Almost done',
    });
  });

  it('should clear progress for specific callId', () => {
    const { result } = renderHook(() => useMCPProgress());

    act(() => {
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-1',
        serverName: 'server',
        toolName: 'tool',
        progress: 50,
      });
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-2',
        serverName: 'server',
        toolName: 'tool',
        progress: 75,
      });
    });

    act(() => {
      result.current.clearProgress('call-1');
    });

    expect(result.current.progressState).toEqual({
      'call-2': { progress: 75, total: undefined, message: undefined },
    });
  });

  it('should clear all progress', () => {
    const { result } = renderHook(() => useMCPProgress());

    act(() => {
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-1',
        serverName: 'server',
        toolName: 'tool',
        progress: 50,
      });
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-2',
        serverName: 'server',
        toolName: 'tool',
        progress: 75,
      });
    });

    act(() => {
      result.current.clearAllProgress();
    });

    expect(result.current.progressState).toEqual({});
  });

  it('should reject late progress events for completed callIds', () => {
    const { result } = renderHook(() => useMCPProgress());

    // Emit progress for a call
    act(() => {
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-1',
        serverName: 'server',
        toolName: 'tool',
        progress: 50,
      });
    });

    // Clear progress (simulating tool reaching terminal state)
    act(() => {
      result.current.clearProgress('call-1');
    });

    expect(result.current.progressState).toEqual({});

    // Late progress event for same callId should be ignored
    act(() => {
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-1',
        serverName: 'server',
        toolName: 'tool',
        progress: 75,
      });
    });

    // Should still be empty — late event rejected
    expect(result.current.progressState).toEqual({});
  });

  it('should allow progress for previously-completed callId after clearAllProgress', () => {
    const { result } = renderHook(() => useMCPProgress());

    // Complete a call
    act(() => {
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-1',
        serverName: 'server',
        toolName: 'tool',
        progress: 100,
      });
      result.current.clearProgress('call-1');
    });

    // clearAllProgress resets completed tracking (new schedule)
    act(() => {
      result.current.clearAllProgress();
    });

    // Same callId should now be accepted again (fresh schedule)
    act(() => {
      coreEvents.emit(CoreEvent.MCPToolProgress, {
        callId: 'call-1',
        serverName: 'server',
        toolName: 'tool',
        progress: 25,
      });
    });

    expect(result.current.progressState['call-1']).toEqual({
      progress: 25,
      total: undefined,
      message: undefined,
    });
  });

  it('should unsubscribe from events on unmount', () => {
    const listenersBefore = coreEvents.listenerCount(CoreEvent.MCPToolProgress);
    const { unmount } = renderHook(() => useMCPProgress());

    // Hook should have added a listener
    expect(coreEvents.listenerCount(CoreEvent.MCPToolProgress)).toBe(
      listenersBefore + 1,
    );

    unmount();

    // Listener should be removed after unmount
    expect(coreEvents.listenerCount(CoreEvent.MCPToolProgress)).toBe(
      listenersBefore,
    );
  });
});
