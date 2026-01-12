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
    [],
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

describe('Initial Theme Selection', () => {
  const baseProps = {
    onSelect: vi.fn(),
    onCancel: vi.fn(),
    onHighlight: vi.fn(),
    availableTerminalHeight: 40,
    terminalWidth: 120,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should default to a light theme when terminal background is light and no theme is set', () => {
    const settings = createMockSettings(); // No theme set
    const { lastFrame } = renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
        uiState: { terminalBackgroundColor: '#FFFFFF' }, // Light background
      },
    );

    // The snapshot will show which theme is highlighted.
    // We expect 'DefaultLight' to be the one with the '>' indicator.
    expect(lastFrame()).toMatchSnapshot();
  });

  it('should default to a dark theme when terminal background is dark and no theme is set', () => {
    const settings = createMockSettings(); // No theme set
    const { lastFrame } = renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
        uiState: { terminalBackgroundColor: '#000000' }, // Dark background
      },
    );

    // We expect 'DefaultDark' to be highlighted.
    expect(lastFrame()).toMatchSnapshot();
  });

  it('should use the theme from settings even if terminal background suggests a different theme type', () => {
    const settings = createMockSettings({ ui: { theme: 'DefaultLight' } }); // Light theme set
    const { lastFrame } = renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
        uiState: { terminalBackgroundColor: '#000000' }, // Dark background
      },
    );

    // We expect 'DefaultLight' to be highlighted, respecting the settings.
    expect(lastFrame()).toMatchSnapshot();
  });
});

describe('Hint Visibility', () => {
  const baseProps = {
    onSelect: vi.fn(),
    onCancel: vi.fn(),
    onHighlight: vi.fn(),
    availableTerminalHeight: 40,
    terminalWidth: 120,
  };

  it('should show hint when theme background matches terminal background', () => {
    const settings = createMockSettings({ ui: { theme: 'Default' } });
    const { lastFrame } = renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
        uiState: { terminalBackgroundColor: '#1E1E2E' },
      },
    );

    expect(lastFrame()).toContain('(Matches terminal)');
  });

  it('should not show hint when theme background does not match terminal background', () => {
    const settings = createMockSettings({ ui: { theme: 'Default' } });
    const { lastFrame } = renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
        uiState: { terminalBackgroundColor: '#FFFFFF' },
      },
    );

    expect(lastFrame()).not.toContain('(Matches terminal)');
  });
});
