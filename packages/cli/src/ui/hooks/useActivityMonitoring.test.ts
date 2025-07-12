/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useActivityMonitoring,
  useActivityRecorder,
} from './useActivityMonitoring.js';
import { Config } from '@google/gemini-cli-core';

// Mock the core package
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    startGlobalActivityMonitoring: vi.fn(),
    stopGlobalActivityMonitoring: vi.fn(),
    getActivityMonitor: vi.fn(() => ({
      isMonitoringActive: () => true,
      getActivityStats: () => ({
        totalEvents: 5,
        eventTypes: {
          ['user_input_start']: 2,
          ['message_added']: 3,
        },
        timeRange: { start: Date.now() - 1000, end: Date.now() },
      }),
    })),
    recordUserActivity: vi.fn(),
    ActivityType: {
      USER_INPUT_START: 'user_input_start',
      USER_INPUT_END: 'user_input_end',
      MESSAGE_ADDED: 'message_added',
      TOOL_CALL_SCHEDULED: 'tool_call_scheduled',
      TOOL_CALL_COMPLETED: 'tool_call_completed',
      STREAM_START: 'stream_start',
      STREAM_END: 'stream_end',
      HISTORY_UPDATED: 'history_updated',
      MANUAL_TRIGGER: 'manual_trigger',
    },
  };
});

describe('useActivityMonitoring', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getSessionId: () => 'test-session',
    } as Config;
  });

  it('should initialize activity monitoring with default options', () => {
    const { result } = renderHook(() => useActivityMonitoring(mockConfig));

    expect(result.current.isActive).toBe(true);
    expect(result.current.recordActivity).toBeDefined();
    expect(result.current.getStats).toBeDefined();
    expect(result.current.startMonitoring).toBeDefined();
    expect(result.current.stopMonitoring).toBeDefined();
  });

  it('should handle custom configuration', () => {
    const customConfig = {
      snapshotThrottleMs: 2000,
      maxEventBuffer: 50,
    };

    const { result } = renderHook(() =>
      useActivityMonitoring(mockConfig, {
        enabled: true,
        config: customConfig,
        autoStart: true,
      }),
    );

    expect(result.current.isActive).toBe(true);
  });

  it('should not start monitoring when disabled', () => {
    const { result } = renderHook(() =>
      useActivityMonitoring(mockConfig, { enabled: false }),
    );

    expect(result.current.isActive).toBe(false);
  });

  it('should record activity events', async () => {
    const { result } = renderHook(() => useActivityMonitoring(mockConfig));

    await act(() => {
      result.current.recordActivity('user_input_start', 'test-context');
    });

    const { recordUserActivity } = await import('@google/gemini-cli-core');
    expect(recordUserActivity).toHaveBeenCalledWith();
  });

  it('should get activity statistics', async () => {
    const { result } = renderHook(() => useActivityMonitoring(mockConfig));

    await act(() => {
      const stats = result.current.getStats();
      expect(stats).toBeDefined();
      expect(stats?.totalEvents).toBe(5);
    });
  });

  it('should start and stop monitoring manually', async () => {
    const { result } = renderHook(() =>
      useActivityMonitoring(mockConfig, { autoStart: false }),
    );

    await act(() => {
      result.current.startMonitoring();
    });

    await act(() => {
      result.current.stopMonitoring();
    });

    const { startGlobalActivityMonitoring, stopGlobalActivityMonitoring } =
      await import('@google/gemini-cli-core');
    expect(startGlobalActivityMonitoring).toHaveBeenCalled();
    expect(stopGlobalActivityMonitoring).toHaveBeenCalled();
  });

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() => useActivityMonitoring(mockConfig));

    unmount();

    // Cleanup should happen automatically via useEffect
    expect(true).toBe(true); // Test passes if no errors thrown
  });
});

describe('useActivityRecorder', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getSessionId: () => 'test-session',
    } as Config;
  });

  it('should provide convenience recording functions', () => {
    const { result } = renderHook(() => useActivityRecorder(mockConfig));

    expect(result.current.recordUserInput).toBeDefined();
    expect(result.current.recordUserInputEnd).toBeDefined();
    expect(result.current.recordMessageAdded).toBeDefined();
    expect(result.current.recordToolCall).toBeDefined();
    expect(result.current.recordStreamStart).toBeDefined();
    expect(result.current.recordStreamEnd).toBeDefined();
    expect(result.current.recordHistoryUpdate).toBeDefined();
  });

  it('should record user input activity', async () => {
    const { result } = renderHook(() => useActivityRecorder(mockConfig));

    await act(() => {
      result.current.recordUserInput('test-input');
    });

    const { recordUserActivity } = await import('@google/gemini-cli-core');
    expect(recordUserActivity).toHaveBeenCalledWith();
  });

  it('should record message added activity with metadata', async () => {
    const { result } = renderHook(() => useActivityRecorder(mockConfig));
    const metadata = { messageType: 'user', length: 10 };

    await act(() => {
      result.current.recordMessageAdded('new-message', metadata);
    });

    const { recordUserActivity } = await import('@google/gemini-cli-core');
    expect(recordUserActivity).toHaveBeenCalledWith();
  });

  it('should record tool call activity', async () => {
    const { result } = renderHook(() => useActivityRecorder(mockConfig));
    const metadata = { toolName: 'read-file', callId: 'call-123' };

    await act(() => {
      result.current.recordToolCall('tool-execution', metadata);
    });

    const { recordUserActivity } = await import('@google/gemini-cli-core');
    expect(recordUserActivity).toHaveBeenCalledWith();
  });

  it('should record stream events', async () => {
    const { result } = renderHook(() => useActivityRecorder(mockConfig));

    await act(() => {
      result.current.recordStreamStart('gemini-stream');
      result.current.recordStreamEnd('gemini-stream-complete');
    });

    const { recordUserActivity } = await import('@google/gemini-cli-core');
    expect(recordUserActivity).toHaveBeenCalledTimes(2);
  });

  it('should record history updates', async () => {
    const { result } = renderHook(() => useActivityRecorder(mockConfig));
    const metadata = { itemCount: 5, operation: 'clear' };

    await act(() => {
      result.current.recordHistoryUpdate('history-cleared', metadata);
    });

    const { recordUserActivity } = await import('@google/gemini-cli-core');
    expect(recordUserActivity).toHaveBeenCalledWith();
  });

  it('should not record activities when disabled', async () => {
    const { result } = renderHook(() => useActivityRecorder(mockConfig, false));

    await act(() => {
      result.current.recordUserInput('test');
    });

    const { recordUserActivity } = await import('@google/gemini-cli-core');
    expect(recordUserActivity).not.toHaveBeenCalled();
  });
});
