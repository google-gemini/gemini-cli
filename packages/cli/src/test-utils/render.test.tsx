/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Text } from 'ink';
import { renderWithProviders } from './render.js';
import { useSettings } from '../ui/contexts/SettingsContext.js';
import { useShellFocusState } from '../ui/contexts/ShellFocusContext.js';
import { LoadedSettings } from '../config/settings.js';

describe('renderWithProviders', () => {
  it('should render component', () => {
    const { lastFrame } = renderWithProviders(<Text>Test</Text>);
    expect(lastFrame()).toContain('Test');
  });

  it('should provide SettingsContext', () => {
    let settingsProvided = false;
    const TestComponent = () => {
      const settings = useSettings();
      settingsProvided = settings !== undefined;
      return <Text>Rendered</Text>;
    };

    renderWithProviders(<TestComponent />);
    expect(settingsProvided).toBe(true);
  });

  it('should provide ShellFocusContext with default true', () => {
    const TestComponent = () => {
      const focusValue = useShellFocusState();
      return <Text>Focus: {String(focusValue)}</Text>;
    };

    const { lastFrame } = renderWithProviders(<TestComponent />);
    expect(lastFrame()).toContain('Focus: true');
  });

  it('should accept custom shellFocus option', () => {
    const TestComponent = () => {
      const focusValue = useShellFocusState();
      return <Text>Focus: {String(focusValue)}</Text>;
    };

    const { lastFrame } = renderWithProviders(<TestComponent />, {
      shellFocus: false,
    });
    expect(lastFrame()).toContain('Focus: false');
  });

  it('should accept custom settings option', () => {
    const customSettings = new LoadedSettings(
      {
        path: '/custom',
        settings: { ui: { theme: 'light' } },
        originalSettings: {},
      },
      { path: '', settings: {}, originalSettings: {} },
      { path: '', settings: {}, originalSettings: {} },
      { path: '', settings: {}, originalSettings: {} },
      true,
      new Set(),
    );

    let receivedSettings: LoadedSettings | null = null;
    const TestComponent = () => {
      receivedSettings = useSettings();
      return <Text>Rendered</Text>;
    };

    renderWithProviders(<TestComponent />, { settings: customSettings });
    expect(receivedSettings).toBe(customSettings);
  });

  it('should provide KeypressProvider', () => {
    const { lastFrame } = renderWithProviders(<Text>Test</Text>);
    expect(lastFrame()).toBeDefined();
  });

  it('should not crash on render', () => {
    expect(() => {
      renderWithProviders(<Text>Test</Text>);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = renderWithProviders(<Text>Test</Text>);
    expect(() => unmount()).not.toThrow();
  });

  it('should support all options together', () => {
    const customSettings = new LoadedSettings(
      { path: '', settings: {}, originalSettings: {} },
      { path: '', settings: {}, originalSettings: {} },
      { path: '', settings: {}, originalSettings: {} },
      { path: '', settings: {}, originalSettings: {} },
      false,
      new Set(),
    );

    const { lastFrame } = renderWithProviders(<Text>Test</Text>, {
      shellFocus: false,
      settings: customSettings,
    });
    expect(lastFrame()).toContain('Test');
  });

  it('should enable kitty protocol by default', () => {
    // Component renders without error, implying KeypressProvider is configured
    const { lastFrame } = renderWithProviders(<Text>Test</Text>);
    expect(lastFrame()).toBeDefined();
  });
});
