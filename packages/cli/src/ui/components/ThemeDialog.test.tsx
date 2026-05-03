/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThemeDialog } from './ThemeDialog.js';

const { mockIsDevelopment } = vi.hoisted(() => ({
  mockIsDevelopment: { value: false },
}));

vi.mock('../../utils/installationInfo.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../utils/installationInfo.js')>();
  return {
    ...actual,
    get isDevelopment() {
      return mockIsDevelopment.value;
    },
  };
});

import { createMockSettings } from '../../test-utils/settings.js';
import { DEFAULT_THEME, themeManager } from '../themes/theme-manager.js';
import { act } from 'react';

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

  it.each([true, false])(
    'should render correctly in theme selection mode (isDevelopment: %s)',
    async (isDev) => {
      mockIsDevelopment.value = isDev;
      const settings = createMockSettings();
      const { lastFrame, unmount } = await renderWithProviders(
        <ThemeDialog {...baseProps} settings={settings} />,
        { settings },
      );

      expect(lastFrame()).toMatchSnapshot();
      unmount();
    },
  );

  it('should render correctly in scope selector mode', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin, waitUntilReady, unmount } =
      await renderWithProviders(
        <ThemeDialog {...baseProps} settings={settings} />,
        { settings },
      );

    // Press Tab to switch to scope selector mode
    await act(async () => {
      stdin.write('\t');
    });

    // Need to wait for the state update to propagate
    await waitUntilReady();

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should call onCancel when ESC is pressed', async () => {
    const mockOnCancel = vi.fn();
    const settings = createMockSettings();
    const { stdin, waitUntilReady, unmount } = await renderWithProviders(
      <ThemeDialog
        {...baseProps}
        onCancel={mockOnCancel}
        settings={settings}
      />,
      { settings },
    );

    await act(async () => {
      stdin.write('\x1b');
    });

    // ESC key has a 50ms timeout in KeypressContext, so we need to wrap waitUntilReady in act
    await act(async () => {
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(mockOnCancel).toHaveBeenCalled();
    });
    unmount();
  });

  it('should call onSelect when a theme is selected', async () => {
    const settings = createMockSettings();
    const { stdin, waitUntilReady, unmount } = await renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
      },
    );

    // Press Enter to select the theme
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(baseProps.onSelect).toHaveBeenCalled();
    });
    unmount();
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

  it('should default to a light theme when terminal background is light and no theme is set', async () => {
    const settings = createMockSettings(); // No theme set
    const { lastFrame, unmount } = await renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
        uiState: { terminalBackgroundColor: '#FFFFFF' }, // Light background
      },
    );

    // The snapshot will show which theme is highlighted.
    // We expect 'DefaultLight' to be the one with the '>' indicator.
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should default to a dark theme when terminal background is dark and no theme is set', async () => {
    const settings = createMockSettings(); // No theme set
    const { lastFrame, unmount } = await renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
        uiState: { terminalBackgroundColor: '#000000' }, // Dark background
      },
    );

    // We expect 'DefaultDark' to be highlighted.
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should use the theme from settings even if terminal background suggests a different theme type', async () => {
    const settings = createMockSettings({ ui: { theme: 'DefaultLight' } }); // Light theme set
    const { lastFrame, unmount } = await renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
        uiState: { terminalBackgroundColor: '#000000' }, // Dark background
      },
    );

    // We expect 'DefaultLight' to be highlighted, respecting the settings.
    expect(lastFrame()).toMatchSnapshot();
    unmount();
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

  it('should show hint when theme background matches terminal background', async () => {
    const settings = createMockSettings({ ui: { theme: 'Default' } });
    const { lastFrame, unmount } = await renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
        uiState: { terminalBackgroundColor: '#000000' },
      },
    );

    expect(lastFrame()).toContain('(Matches terminal)');
    unmount();
  });

  it('should not show hint when theme background does not match terminal background', async () => {
    const settings = createMockSettings({ ui: { theme: 'Default' } });
    const { lastFrame, unmount } = await renderWithProviders(
      <ThemeDialog {...baseProps} settings={settings} />,
      {
        settings,
        uiState: { terminalBackgroundColor: '#123456' },
      },
    );

    expect(lastFrame()).not.toContain('(Matches terminal)');
    unmount();
  });
});
