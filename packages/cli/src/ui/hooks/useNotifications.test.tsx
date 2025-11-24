/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import {
  renderHookWithProviders,
  createMockSettings,
} from '../../test-utils/render.js';
import { useNotifications } from './useNotifications.js';
import { StreamingState } from '../types.js';
import { NotificationManager } from '../../notifications/manager.js';

// Mock NotificationManager
vi.mock('../../notifications/manager.js', () => ({
  NotificationManager: vi.fn(),
}));

const mockNotificationManager = vi.mocked(NotificationManager);

describe('useNotifications', () => {
  let mockManagerInstance: {
    notify: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    startIdleTimer: ReturnType<typeof vi.fn>;
    cancelIdleTimer: ReturnType<typeof vi.fn>;
    updateSettings: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockManagerInstance = {
      notify: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      startIdleTimer: vi.fn(),
      cancelIdleTimer: vi.fn(),
      updateSettings: vi.fn(),
    };
    mockNotificationManager.mockImplementation(
      () => mockManagerInstance as unknown as NotificationManager,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should initialize NotificationManager on mount', () => {
    const settings = createMockSettings({
      general: {
        notifications: {
          enabled: true,
          events: {
            inputRequired: { enabled: true, sound: 'system' },
          },
        },
      },
    });

    renderHookWithProviders(
      () => useNotifications(settings, StreamingState.Idle, false, true),
      {
        settings,
      },
    );

    expect(mockNotificationManager).toHaveBeenCalledTimes(1);
    expect(mockNotificationManager).toHaveBeenCalledWith(settings);
  });

  it('should dispose NotificationManager on unmount', () => {
    const settings = createMockSettings({});

    const { unmount } = renderHookWithProviders(
      () => useNotifications(settings, StreamingState.Idle, false, true),
      {
        settings,
      },
    );

    unmount();

    expect(mockManagerInstance.dispose).toHaveBeenCalledTimes(1);
  });

  it('should update settings when settings change', () => {
    const settings1 = createMockSettings({
      general: {
        notifications: {
          enabled: true,
        },
      },
    });

    const { rerender } = renderHookWithProviders(
      (props) =>
        useNotifications(props.settings, StreamingState.Idle, false, true),
      {
        initialProps: { settings: settings1 },
        settings: settings1,
      },
    );

    const settings2 = createMockSettings({
      general: {
        notifications: {
          enabled: false,
        },
      },
    });

    act(() => {
      rerender({ settings: settings2 });
    });

    expect(mockManagerInstance.updateSettings).toHaveBeenCalledWith(settings2);
  });

  describe('taskComplete notification', () => {
    it('should trigger taskComplete when streaming completes and user is not focused', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              taskComplete: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(
            settings,
            props.streamingState,
            false,
            props.isFocused,
          ),
        {
          initialProps: {
            streamingState: StreamingState.Responding,
            isFocused: false,
          },
          settings,
        },
      );

      // Transition from Responding to Idle while not focused
      act(() => {
        rerender({
          streamingState: StreamingState.Idle,
          isFocused: false,
        });
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockManagerInstance.notify).toHaveBeenCalledWith('taskComplete');
    });

    it('should not trigger taskComplete when user is focused', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              taskComplete: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(
            settings,
            props.streamingState,
            false,
            props.isFocused,
          ),
        {
          initialProps: {
            streamingState: StreamingState.Responding,
            isFocused: true,
          },
          settings,
        },
      );

      // Transition from Responding to Idle while focused
      act(() => {
        rerender({
          streamingState: StreamingState.Idle,
          isFocused: true,
        });
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockManagerInstance.notify).not.toHaveBeenCalled();
    });

    it('should not trigger taskComplete when transitioning from Idle to Idle', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              taskComplete: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(settings, props.streamingState, false, false),
        {
          initialProps: {
            streamingState: StreamingState.Idle,
            isFocused: false,
          },
          settings,
        },
      );

      act(() => {
        rerender({
          streamingState: StreamingState.Idle,
          isFocused: false,
        });
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockManagerInstance.notify).not.toHaveBeenCalled();
    });

    it('should trigger taskComplete when transitioning from WaitingForConfirmation to Idle', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              taskComplete: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(settings, props.streamingState, false, false),
        {
          initialProps: {
            streamingState: StreamingState.WaitingForConfirmation,
            isFocused: false,
          },
          settings,
        },
      );

      act(() => {
        rerender({
          streamingState: StreamingState.Idle,
          isFocused: false,
        });
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockManagerInstance.notify).toHaveBeenCalledWith('taskComplete');
    });
  });

  describe('inputRequired notification', () => {
    it('should trigger inputRequired when transitioning to WaitingForConfirmation and not focused', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              inputRequired: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(
            settings,
            props.streamingState,
            false,
            props.isFocused,
          ),
        {
          initialProps: {
            streamingState: StreamingState.Responding,
            isFocused: false,
          },
          settings,
        },
      );

      // Transition to WaitingForConfirmation
      act(() => {
        rerender({
          streamingState: StreamingState.WaitingForConfirmation,
          isFocused: false,
        });
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockManagerInstance.notify).toHaveBeenCalledWith('inputRequired');
      expect(mockManagerInstance.startIdleTimer).toHaveBeenCalled();
    });

    it('should trigger inputRequired when tools finish and input becomes active', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              inputRequired: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(
            settings,
            props.streamingState,
            props.isInputActive,
            props.isFocused,
          ),
        {
          initialProps: {
            streamingState: StreamingState.Responding,
            isInputActive: false,
            isFocused: false,
          },
          settings,
        },
      );

      // Transition from Responding to Idle, and input becomes active
      act(() => {
        rerender({
          streamingState: StreamingState.Idle,
          isInputActive: true,
          isFocused: false,
        });
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockManagerInstance.notify).toHaveBeenCalledWith('inputRequired');
      expect(mockManagerInstance.startIdleTimer).toHaveBeenCalled();
    });

    it('should not trigger inputRequired when user is focused', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              inputRequired: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(
            settings,
            props.streamingState,
            false,
            props.isFocused,
          ),
        {
          initialProps: {
            streamingState: StreamingState.Responding,
            isFocused: true,
          },
          settings,
        },
      );

      act(() => {
        rerender({
          streamingState: StreamingState.WaitingForConfirmation,
          isFocused: true,
        });
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockManagerInstance.notify).not.toHaveBeenCalled();
    });

    it('should not trigger inputRequired if already in WaitingForConfirmation', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              inputRequired: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(settings, props.streamingState, false, false),
        {
          initialProps: {
            streamingState: StreamingState.WaitingForConfirmation,
            isFocused: false,
          },
          settings,
        },
      );

      // Stay in WaitingForConfirmation
      act(() => {
        rerender({
          streamingState: StreamingState.WaitingForConfirmation,
          isFocused: false,
        });
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockManagerInstance.notify).not.toHaveBeenCalled();
    });
  });

  describe('idle timer management', () => {
    it('should cancel idle timer when user focuses on terminal', () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              inputRequired: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(
            settings,
            StreamingState.Idle,
            false,
            props.isFocused,
          ),
        {
          initialProps: {
            isFocused: false,
          },
          settings,
        },
      );

      // User focuses
      act(() => {
        rerender({
          isFocused: true,
        });
      });

      expect(mockManagerInstance.cancelIdleTimer).toHaveBeenCalled();
    });

    it('should cancel idle timer when input becomes active', () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              inputRequired: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(
            settings,
            StreamingState.Idle,
            props.isInputActive,
            false,
          ),
        {
          initialProps: {
            isInputActive: false,
          },
          settings,
        },
      );

      // Input becomes active
      act(() => {
        rerender({
          isInputActive: true,
        });
      });

      expect(mockManagerInstance.cancelIdleTimer).toHaveBeenCalled();
    });

    it('should not cancel idle timer if already focused', () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              inputRequired: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(
            settings,
            StreamingState.Idle,
            false,
            props.isFocused,
          ),
        {
          initialProps: {
            isFocused: true,
          },
          settings,
        },
      );

      // Stay focused
      act(() => {
        rerender({
          isFocused: true,
        });
      });

      // Should not cancel since it was already focused
      expect(mockManagerInstance.cancelIdleTimer).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle errors in taskComplete notification gracefully', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockManagerInstance.notify.mockRejectedValueOnce(new Error('Test error'));

      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              taskComplete: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(settings, props.streamingState, false, false),
        {
          initialProps: {
            streamingState: StreamingState.Responding,
            isFocused: false,
          },
          settings,
        },
      );

      act(() => {
        rerender({
          streamingState: StreamingState.Idle,
          isFocused: false,
        });
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Should not throw
      expect(mockManagerInstance.notify).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should handle errors in inputRequired notification gracefully', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockManagerInstance.notify.mockRejectedValueOnce(new Error('Test error'));

      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              inputRequired: { enabled: true, sound: 'system' },
            },
          },
        },
      });

      const { rerender } = renderHookWithProviders(
        (props) =>
          useNotifications(settings, props.streamingState, false, false),
        {
          initialProps: {
            streamingState: StreamingState.Responding,
            isFocused: false,
          },
          settings,
        },
      );

      act(() => {
        rerender({
          streamingState: StreamingState.WaitingForConfirmation,
          isFocused: false,
        });
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Should not throw
      expect(mockManagerInstance.notify).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
