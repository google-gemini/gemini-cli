/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThemeDialog } from './ThemeDialog.js';
import { LoadedSettings } from '../../config/settings.js';
import { KeypressProvider } from '../contexts/KeypressContext.js';
import { SettingsContext } from '../contexts/SettingsContext.js';
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
    const { lastFrame } = render(
      <SettingsContext.Provider value={settings}>
        <KeypressProvider kittyProtocolEnabled={false}>
          <ThemeDialog {...baseProps} settings={settings} />
        </KeypressProvider>
      </SettingsContext.Provider>,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('should render correctly in scope selector mode', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin } = render(
      <SettingsContext.Provider value={settings}>
        <KeypressProvider kittyProtocolEnabled={false}>
          <ThemeDialog {...baseProps} settings={settings} />
        </KeypressProvider>
      </SettingsContext.Provider>,
    );

    // Press Tab to switch to scope selector mode
    act(() => {
      stdin.write('\t');
    });

    // Need to wait for the state update to propagate
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(lastFrame()).toMatchSnapshot();
  });
});
