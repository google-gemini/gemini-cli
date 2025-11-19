/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SettingsContext, useSettings } from './SettingsContext.js';
import { LoadedSettings } from '../../config/settings.js';

describe('SettingsContext', () => {
  it('should create a context', () => {
    expect(SettingsContext).toBeDefined();
  });

  it('should have undefined as default value', () => {
    expect(SettingsContext._currentValue).toBeUndefined();
  });
});

describe('useSettings', () => {
  it('should throw error when used outside provider', () => {
    expect(() => {
      renderHook(() => useSettings());
    }).toThrow('useSettings must be used within a SettingsProvider');
  });

  it('should return settings when used inside provider', () => {
    const mockSettings = new LoadedSettings(
      { path: '/user', settings: {}, originalSettings: {} },
      { path: '/workspace', settings: {}, originalSettings: {} },
      { path: '/project', settings: {}, originalSettings: {} },
      { path: '/default', settings: {}, originalSettings: {} },
      true,
      new Set(),
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsContext.Provider value={mockSettings}>
        {children}
      </SettingsContext.Provider>
    );

    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current).toBe(mockSettings);
  });

  it('should access merged settings', () => {
    const mockSettings = new LoadedSettings(
      {
        path: '/user',
        settings: { ui: { theme: 'dark' } },
        originalSettings: {},
      },
      { path: '/workspace', settings: {}, originalSettings: {} },
      { path: '/project', settings: {}, originalSettings: {} },
      { path: '/default', settings: {}, originalSettings: {} },
      true,
      new Set(),
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsContext.Provider value={mockSettings}>
        {children}
      </SettingsContext.Provider>
    );

    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.merged).toBeDefined();
  });

  it('should not crash when accessing settings properties', () => {
    const mockSettings = new LoadedSettings(
      { path: '', settings: {}, originalSettings: {} },
      { path: '', settings: {}, originalSettings: {} },
      { path: '', settings: {}, originalSettings: {} },
      { path: '', settings: {}, originalSettings: {} },
      true,
      new Set(),
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsContext.Provider value={mockSettings}>
        {children}
      </SettingsContext.Provider>
    );

    expect(() => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      const _merged = result.current.merged;
    }).not.toThrow();
  });
});
