/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationManager } from './manager.js';
import { createMockSettings } from '../test-utils/render.js';
import { SettingScope } from '../config/settings.js';
import * as soundPlayer from './player.js';

// Mock the sound player
vi.mock('./player.js', () => ({
  playSound: vi.fn().mockResolvedValue(undefined),
}));

const mockPlaySound = vi.mocked(soundPlayer.playSound);

describe('NotificationManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPlaySound.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default settings when no settings provided', () => {
      const settings = createMockSettings({});
      const manager = new NotificationManager(settings);
      const status = manager.getStatus();

      expect(status.enabled).toBe(false);
      expect(status.events.inputRequired?.enabled).toBe(true);
      expect(status.events.taskComplete?.enabled).toBe(true);
      expect(status.events.idleAlert?.enabled).toBe(true);
    });

    it('should load settings from LoadedSettings', () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: false,
            events: {
              inputRequired: { enabled: true, sound: 'system' },
              taskComplete: {
                enabled: true,
                sound: 'custom',
                customPath: '/path/to/sound.wav',
              },
              idleAlert: {
                enabled: false,
                sound: 'system',
                timeout: 120,
              },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);
      const status = manager.getStatus();

      expect(status.enabled).toBe(false);
      expect(status.events.inputRequired?.enabled).toBe(true);
      expect(status.events.taskComplete?.enabled).toBe(true);
      expect(status.events.taskComplete?.customPath).toBe('/path/to/sound.wav');
      expect(status.events.idleAlert?.enabled).toBe(false);
      expect(status.events.idleAlert?.timeout).toBe(120);
    });
  });

  describe('notify', () => {
    it('should not notify when notifications are disabled', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: false,
            events: {
              inputRequired: { enabled: true, sound: 'system' },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      await manager.notify('inputRequired');

      expect(mockPlaySound).not.toHaveBeenCalled();
    });

    it('should not notify when event is disabled', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              inputRequired: { enabled: false, sound: 'system' },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      await manager.notify('inputRequired');

      expect(mockPlaySound).not.toHaveBeenCalled();
    });

    it('should notify when enabled and event is enabled', async () => {
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
      const manager = new NotificationManager(settings);

      await manager.notify('inputRequired');

      expect(mockPlaySound).toHaveBeenCalledWith(
        { sound: 'system' },
        'inputRequired',
      );
    });

    it('should notify with custom sound path when configured', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              taskComplete: {
                enabled: true,
                sound: 'custom',
                customPath: '/custom/sound.wav',
              },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      await manager.notify('taskComplete');

      expect(mockPlaySound).toHaveBeenCalledWith(
        { sound: 'custom', customPath: '/custom/sound.wav' },
        'taskComplete',
      );
    });
  });

  describe('updateSettings', () => {
    it('should update settings when called', () => {
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
      const manager = new NotificationManager(settings);

      settings.setValue(
        SettingScope.User,
        'general.notifications.enabled',
        false,
      );
      manager.updateSettings(settings);

      const status = manager.getStatus();
      expect(status.enabled).toBe(false);
    });

    it('should update idle timer if already running', () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              idleAlert: { enabled: true, sound: 'system', timeout: 60 },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      // Start the idle timer
      manager.startIdleTimer();

      // Update timeout
      settings.setValue(
        SettingScope.User,
        'general.notifications.events.idleAlert.timeout',
        120,
      );
      manager.updateSettings(settings);

      // Timer should be updated (we can't easily test the exact timeout, but we can verify it doesn't crash)
      expect(manager.getStatus().events.idleAlert?.timeout).toBe(120);
    });
  });

  describe('idle timer', () => {
    it('should start idle timer when startIdleTimer is called', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              idleAlert: { enabled: true, sound: 'system', timeout: 60 },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      manager.startIdleTimer();

      // Advance time past the timeout
      await vi.advanceTimersByTimeAsync(61000);

      expect(mockPlaySound).toHaveBeenCalledWith(
        { sound: 'system' },
        'idleAlert',
      );
    });

    it('should cancel idle timer when cancelIdleTimer is called', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              idleAlert: { enabled: true, sound: 'system', timeout: 60 },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      manager.startIdleTimer();
      manager.cancelIdleTimer();

      // Advance time past the timeout
      await vi.advanceTimersByTimeAsync(61000);

      expect(mockPlaySound).not.toHaveBeenCalled();
    });

    it('should not trigger idle alert if notifications are disabled', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: false,
            events: {
              idleAlert: { enabled: true, sound: 'system', timeout: 60 },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      manager.startIdleTimer();

      await vi.advanceTimersByTimeAsync(61000);

      expect(mockPlaySound).not.toHaveBeenCalled();
    });

    it('should not trigger idle alert if idleAlert event is disabled', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              idleAlert: { enabled: false, sound: 'system', timeout: 60 },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      manager.startIdleTimer();

      await vi.advanceTimersByTimeAsync(61000);

      expect(mockPlaySound).not.toHaveBeenCalled();
    });

    it('should not trigger multiple idle alerts if already active', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              idleAlert: { enabled: true, sound: 'system', timeout: 60 },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      manager.startIdleTimer();

      // Advance time past the timeout
      await vi.advanceTimersByTimeAsync(61000);

      expect(mockPlaySound).toHaveBeenCalledTimes(1);

      // Try to trigger again
      await vi.advanceTimersByTimeAsync(61000);

      // Should still only be called once
      expect(mockPlaySound).toHaveBeenCalledTimes(1);
    });

    it('should use custom timeout from settings', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              idleAlert: {
                enabled: true,
                sound: 'system',
                timeout: 30,
              },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      manager.startIdleTimer();

      // Advance time just before timeout
      await vi.advanceTimersByTimeAsync(29000);
      expect(mockPlaySound).not.toHaveBeenCalled();

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockPlaySound).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('should clean up idle timer on dispose', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              idleAlert: { enabled: true, sound: 'system', timeout: 60 },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      manager.startIdleTimer();
      manager.dispose();

      await vi.advanceTimersByTimeAsync(61000);

      expect(mockPlaySound).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return current notification configuration', () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              inputRequired: { enabled: true, sound: 'system' },
              taskComplete: { enabled: false, sound: 'system' },
              idleAlert: {
                enabled: true,
                sound: 'custom',
                customPath: '/path.wav',
                timeout: 90,
              },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      const status = manager.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.events.inputRequired?.enabled).toBe(true);
      expect(status.events.inputRequired?.sound).toBe('system');
      expect(status.events.taskComplete?.enabled).toBe(false);
      expect(status.events.idleAlert?.enabled).toBe(true);
      expect(status.events.idleAlert?.sound).toBe('custom');
      expect(status.events.idleAlert?.customPath).toBe('/path.wav');
      expect(status.events.idleAlert?.timeout).toBe(90);
    });

    it('should return a copy of settings, not a reference', () => {
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
      const manager = new NotificationManager(settings);

      const status1 = manager.getStatus();
      const status2 = manager.getStatus();

      expect(status1).not.toBe(status2);
      expect(status1).toEqual(status2);
    });
  });

  describe('resetIdleTimer (deprecated)', () => {
    it('should cancel idle timer', async () => {
      const settings = createMockSettings({
        general: {
          notifications: {
            enabled: true,
            events: {
              idleAlert: { enabled: true, sound: 'system', timeout: 60 },
            },
          },
        },
      });
      const manager = new NotificationManager(settings);

      manager.startIdleTimer();
      manager.resetIdleTimer();

      await vi.advanceTimersByTimeAsync(61000);

      expect(mockPlaySound).not.toHaveBeenCalled();
    });
  });
});
