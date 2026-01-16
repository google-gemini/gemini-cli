/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoreEvent } from '@google/gemini-cli-core';
import { renderHook } from '../../test-utils/render.js';
import { SettingsContext, useSettingsStore } from './SettingsContext.js';
import {
  type LoadedSettings,
  SettingScope,
  type Settings,
  type SettingsFile,
} from '../../config/settings.js';

// Mock coreEvents
const mockCoreEvents = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  emitSettingsChanged: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    coreEvents: mockCoreEvents,
  };
});

describe('useSettingsStore', () => {
  let mockLoadedSettings: LoadedSettings;
  let mockSettings: Settings;
  let listeners: Record<string, () => void> = {};

  beforeEach(() => {
    listeners = {};
    mockCoreEvents.on.mockImplementation(
      (event: string, handler: () => void) => {
        listeners[event] = handler;
        return mockCoreEvents;
      },
    );
    mockCoreEvents.off.mockImplementation((event: string) => {
      delete listeners[event];
      return mockCoreEvents;
    });

    mockSettings = {
      ui: {
        theme: 'default-dark',
      },
    };

    const mockSettingsFile: SettingsFile = {
      settings: {},
      originalSettings: {},
      path: '/mock/path',
    };

    // Create a mock LoadedSettings object
    // We cast to unknown first to allow partial mocking for the test
    mockLoadedSettings = {
      merged: mockSettings,
      user: mockSettingsFile,
      workspace: mockSettingsFile,
      system: mockSettingsFile,
      systemDefaults: mockSettingsFile,
      forScope: vi.fn().mockReturnValue(mockSettingsFile),
      setValue: vi.fn(),
    } as unknown as LoadedSettings;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SettingsContext.Provider value={mockLoadedSettings}>
      {children}
    </SettingsContext.Provider>
  );

  it('should return initial settings', () => {
    const { result } = renderHook(() => useSettingsStore(), { wrapper });
    expect(result.current.settings.merged).toBe(mockLoadedSettings.merged);
  });

  it('should subscribe to SettingsChanged event', () => {
    renderHook(() => useSettingsStore(), { wrapper });
    expect(mockCoreEvents.on).toHaveBeenCalledWith(
      CoreEvent.SettingsChanged,
      expect.any(Function),
    );
  });

  it('should unsubscribe from SettingsChanged event on unmount', () => {
    const { unmount } = renderHook(() => useSettingsStore(), { wrapper });
    unmount();
    expect(mockCoreEvents.off).toHaveBeenCalledWith(
      CoreEvent.SettingsChanged,
      expect.any(Function),
    );
  });

  it('should update settings when SettingsChanged event is emitted', async () => {
    const { result } = renderHook(() => useSettingsStore(), { wrapper });

    // Verify initial state
    expect(result.current.settings.merged.ui?.theme).toBe('default-dark');

    // Update the mock settings "externally" (as if setValue was called)
    const newSettings = {
      ui: {
        theme: 'light',
      },
    };
    // We must update the mocked reference because getSnapshot returns loadedSettings.merged
    Object.defineProperty(mockLoadedSettings, 'merged', {
      get: () => newSettings,
    });

    // Trigger the event
    await act(async () => {
      listeners[CoreEvent.SettingsChanged]?.();
    });

    // Verify the hook updated
    expect(result.current.settings.merged.ui?.theme).toBe('light');
  });

  it('should call setValue on loadedSettings when setSetting is called', () => {
    const { result } = renderHook(() => useSettingsStore(), { wrapper });

    result.current.setSetting(SettingScope.User, 'ui.theme', 'light');

    expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'ui.theme',
      'light',
    );
  });
});
