/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHookWithProviders } from '../../test-utils/render.js';
import { useBell } from './useBell.js';
import {
  MessageBusType,
  NotificationType,
  type Config,
} from '@google/gemini-cli-core';
import { LoadedSettings } from '../../config/settings.js';

const mockWrite = vi.fn();
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    useStdout: () => ({ stdout: { write: mockWrite } }),
  };
});

const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockMessageBus = {
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
};

const mockConfig = {
  getMessageBus: () => mockMessageBus,
  getModel: () => 'gemini-pro',
  getTargetDir: () => '/tmp',
  getDebugMode: () => false,
  isTrustedFolder: () => true,
  getIdeMode: () => false,
  getEnableInteractiveShell: () => true,
  getPreviewFeatures: () => false,
} as unknown as Config;

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: { error: vi.fn() },
  };
});

describe('useBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createSettings = (bell: boolean, threshold: number) =>
    new LoadedSettings(
      { path: '', settings: {}, originalSettings: {} },
      { path: '', settings: {}, originalSettings: {} },
      {
        path: '',
        settings: { ui: { bell, bellDurationThreshold: threshold } },
        originalSettings: {},
      },
      { path: '', settings: {}, originalSettings: {} },
      true,
      [],
    );

  it('should subscribe to MessageBus on mount and unsubscribe on unmount', () => {
    const settings = createSettings(true, 0);

    const { unmount } = renderHookWithProviders(() => useBell(), {
      settings,
      config: mockConfig,
    });

    expect(mockSubscribe).toHaveBeenCalledWith(
      MessageBusType.HOOK_EXECUTION_REQUEST,
      expect.any(Function),
    );

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledWith(
      MessageBusType.HOOK_EXECUTION_REQUEST,
      expect.any(Function),
    );
  });

  it.each([
    { type: NotificationType.OperationComplete, name: 'OperationComplete' },
    { type: NotificationType.ActionRequired, name: 'ActionRequired' },
    { type: NotificationType.ToolPermission, name: 'ToolPermission' },
  ])(
    'should ring bell when $name notification occurs and duration >= threshold',
    ({ type }) => {
      const settings = createSettings(true, 5);

      renderHookWithProviders(() => useBell(), {
        settings,
        config: mockConfig,
      });
      const handler = mockSubscribe.mock.calls[0][1];

      // Start operation
      handler({ eventName: 'BeforeAgent', input: {} });

      // Advance time by 6s
      vi.useFakeTimers();
      vi.advanceTimersByTime(6000);

      // Fire notification
      handler({
        eventName: 'Notification',
        input: { notification_type: type },
      });

      expect(mockWrite).toHaveBeenCalledWith('\x07');
      vi.useRealTimers();
    },
  );

  it('should not ring bell if duration < threshold', () => {
    const settings = createSettings(true, 5);

    renderHookWithProviders(() => useBell(), {
      settings,
      config: mockConfig,
    });
    const handler = mockSubscribe.mock.calls[0][1];

    // Start operation
    handler({ eventName: 'BeforeAgent', input: {} });

    // Advance time by 4s
    vi.useFakeTimers();
    vi.advanceTimersByTime(4000);

    // Fire notification
    handler({
      eventName: 'Notification',
      input: { notification_type: NotificationType.OperationComplete },
    });

    expect(mockWrite).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should reset startTime after OperationComplete', () => {
    const settings = createSettings(true, 0);

    renderHookWithProviders(() => useBell(), {
      settings,
      config: mockConfig,
    });
    const handler = mockSubscribe.mock.calls[0][1];

    // Start 1st operation
    handler({ eventName: 'BeforeAgent', input: {} });
    handler({
      eventName: 'Notification',
      input: { notification_type: NotificationType.OperationComplete },
    });
    expect(mockWrite).toHaveBeenCalledTimes(1);

    // Start 2nd operation
    handler({ eventName: 'BeforeAgent', input: {} });
    handler({
      eventName: 'Notification',
      input: { notification_type: NotificationType.OperationComplete },
    });
    expect(mockWrite).toHaveBeenCalledTimes(2);
  });

  it('should not ring bell if disabled', () => {
    const settings = createSettings(false, 0);

    renderHookWithProviders(() => useBell(), {
      settings,
      config: mockConfig,
    });

    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});
