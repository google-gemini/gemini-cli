/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThemeDialog } from './ThemeDialog.js';
import { LoadedSettings } from '../../config/settings.js';
import { DEFAULT_THEME, themeManager } from '../themes/theme-manager.js';
import { act } from 'react';

const createMockSettings = (
  userSettings = {},
  workspaceSettings = {},
  systemSettings = {},
): LoadedSettings =>
  new LoadedSettings(
    {
      settings: { ui: { customThemes: {} }, ...systemSettings },
      originalSettings: { ui: { customThemes: {} }, ...systemSettings },
      path: '/system/settings.json',
    },
    {
      settings: {},
      originalSettings: {},
      path: '/system/system-defaults.json',
    },
    {
      settings: {
        ui: { customThemes: {} },
        ...userSettings,
      },
      originalSettings: {
        ui: { customThemes: {} },
        ...userSettings,
      },
      path: '/user/settings.json',
    },
    {
      settings: {
        ui: { customThemes: {} },
        ...workspaceSettings,
      },
      originalSettings: {
        ui: { customThemes: {} },
        ...workspaceSettings,
      },
      path: '/workspace/settings.json',
    },
    true,
    new Set(),
  );

describe('ThemeDialog Snapshots', () => {
  const baseProps = {
    onSelect: vi.fn(),
    onCancel: vi.fn(),
    onHighlight: vi.fn(),
    availableTerminalHeight: 40,
    terminalWidth: 120,
  };

  beforeEach(() => {
    // Reset theme manager to a known state
    themeManager.setActiveTheme(DEFAULT_THEME.name);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render correctly in theme selection mode', () => {
    const settings = createMockSettings();
    const { lastFrame } = renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      { settings },
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('should render correctly in scope selector mode', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin } = renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      { settings },
    );

    // Press Tab to switch to scope selector mode
    act(() => {
      stdin.write('\t');
    });

    // Need to wait for the state update to propagate
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(lastFrame()).toMatchSnapshot();
  });

  it('should call onCancel when ESC is pressed', async () => {
    const mockOnCancel = vi.fn();
    const settings = createMockSettings();
    const { stdin } = renderWithProviders(
      <ThemeDialog
        {...baseProps}
        onCancel={mockOnCancel}
        settings={settings}
      />,
      { settings },
    );

    act(() => {
      stdin.write('\x1b');
    });

    await waitFor(() => {
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  it('should call refreshStatic when a theme is selected', async () => {
    const mockRefreshStatic = vi.fn();
    const settings = createMockSettings();
    const { stdin } = renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
        uiActions: { refreshStatic: mockRefreshStatic },
      },
    );

    // Press Enter to select the theme
    act(() => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(mockRefreshStatic).toHaveBeenCalled();
      expect(baseProps.onSelect).toHaveBeenCalled();
    });
  });
});
