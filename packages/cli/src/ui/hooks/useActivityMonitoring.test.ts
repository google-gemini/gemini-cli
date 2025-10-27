/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useActivityMonitoring,
  useActivityRecorder,
} from './useActivityMonitoring.js';
import { ActivityType, type Config } from '@google/gemini-cli-core';

// Mock the core package
const mockRecordActivity = vi.fn();
const mockMonitor = {
  recordActivity: mockRecordActivity,
  isMonitoringActive: () => true,
  getActivityStats: () => ({
    totalEvents: 5,
    eventTypes: {
      ['user_input_start']: 2,
      ['message_added']: 3,
    },
    timeRange: { start: Date.now() - 1000, end: Date.now() },
  }),
};

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    startGlobalActivityMonitoring: vi.fn(),
    stopGlobalActivityMonitoring: vi.fn(),
    getActivityMonitor: vi.fn(() => mockMonitor),
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
    mockRecordActivity.mockClear();
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
    const { result } = renderHook(() =>
      useActivityMonitoring(mockConfig, {
        enabled: true,
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
      result.current.recordActivity(
        ActivityType.USER_INPUT_START,
        'test-context',
      );
    });

    expect(mockRecordActivity).toHaveBeenCalledWith(
      ActivityType.USER_INPUT_START,
      'test-context',
      undefined,
    );
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
      useActivityMonitoring(mockConfig, { enabled: true }),
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

  it('should cleanup on unmount', async () => {
    const { unmount } = renderHook(() => useActivityMonitoring(mockConfig));

    const { stopGlobalActivityMonitoring } = await import(
      '@google/gemini-cli-core'
    );

    unmount();

    // Verify cleanup was called automatically via useEffect
    expect(stopGlobalActivityMonitoring).toHaveBeenCalled();
  });
});

describe('useActivityRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordActivity.mockClear();
  });

  it('should provide convenience recording functions', () => {
    const { result } = renderHook(() => useActivityRecorder());

    expect(result.current.recordUserInput).toBeDefined();
    expect(result.current.recordUserInputEnd).toBeDefined();
    expect(result.current.recordMessageAdded).toBeDefined();
    expect(result.current.recordToolCall).toBeDefined();
    expect(result.current.recordStreamStart).toBeDefined();
    expect(result.current.recordStreamEnd).toBeDefined();
    expect(result.current.recordHistoryUpdate).toBeDefined();
  });

  it('should record user input activity', async () => {
    const { result } = renderHook(() => useActivityRecorder());

    await act(() => {
      result.current.recordUserInput();
    });

    expect(mockRecordActivity).toHaveBeenCalled();
  });

  it('should record message added activity with metadata', async () => {
    const { result } = renderHook(() => useActivityRecorder());

    await act(() => {
      result.current.recordMessageAdded();
    });

    expect(mockRecordActivity).toHaveBeenCalled();
  });

  it('should record tool call activity', async () => {
    const { result } = renderHook(() => useActivityRecorder());

    await act(() => {
      result.current.recordToolCall();
    });

    expect(mockRecordActivity).toHaveBeenCalled();
  });

  it('should record stream events', async () => {
    const { result } = renderHook(() => useActivityRecorder());

    await act(() => {
      result.current.recordStreamStart();
      result.current.recordStreamEnd();
    });

    expect(mockRecordActivity).toHaveBeenCalledTimes(2);
  });

  it('should record history updates', async () => {
    const { result } = renderHook(() => useActivityRecorder());

    await act(() => {
      result.current.recordHistoryUpdate();
    });

    expect(mockRecordActivity).toHaveBeenCalled();
  });

  it('should not record activities when disabled', async () => {
    const { result } = renderHook(() => useActivityRecorder(false));

    await act(() => {
      result.current.recordUserInput();
    });

    expect(mockRecordActivity).not.toHaveBeenCalled();
  });
});
