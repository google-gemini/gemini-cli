/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  persistentStateMock,
  renderWithProviders,
} from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import type { LoadedSettings } from '../../config/settings.js';
import { waitFor } from '../../test-utils/async.js';
import { Notifications } from './Notifications.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppContext, type AppState } from '../contexts/AppContext.js';
import { useUIState, type UIState } from '../contexts/UIStateContext.js';
import { useIsScreenReaderEnabled } from 'ink';
import * as fs from 'node:fs/promises';
import { act } from 'react';
import { WarningPriority } from '@google/gemini-cli-core';

// Mock dependencies
vi.mock('../contexts/AppContext.js');
vi.mock('../contexts/UIStateContext.js');
vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useIsScreenReaderEnabled: vi.fn(),
  };
});
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises');
  return {
    ...actual,
    access: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => '/mock/home',
    },
    homedir: () => '/mock/home',
  };
});

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    default: actual.posix,
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    GEMINI_DIR: '.gemini',
    homedir: () => '/mock/home',
    WarningPriority: {
      Low: 'low',
      High: 'high',
    },
    Storage: {
      ...actual.Storage,
      getGlobalTempDir: () => '/mock/temp',
      getGlobalSettingsPath: () => '/mock/home/.gemini/settings.json',
    },
  };
});

describe('Notifications', () => {
  const mockUseAppContext = vi.mocked(useAppContext);
  const mockUseUIState = vi.mocked(useUIState);
  const mockUseIsScreenReaderEnabled = vi.mocked(useIsScreenReaderEnabled);
  const mockFsAccess = vi.mocked(fs.access);
  const mockFsUnlink = vi.mocked(fs.unlink);

  let settings: LoadedSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    persistentStateMock.reset();
    settings = createMockSettings({
      ui: { useAlternateBuffer: true },
    });
    mockUseAppContext.mockReturnValue({
      startupWarnings: [],
      version: '1.0.0',
    } as AppState);
    mockUseUIState.mockReturnValue({
      initError: null,
      streamingState: 'idle',
      updateInfo: null,
    } as unknown as UIState);
    mockUseIsScreenReaderEnabled.mockReturnValue(false);
  });

  it('renders nothing when no notifications', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Notifications />,
      {
        settings,
        width: 100,
      },
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it.each([
    [[{ id: 'w1', message: 'Warning 1', priority: WarningPriority.High }]],
    [
      [
        { id: 'w1', message: 'Warning 1', priority: WarningPriority.High },
        { id: 'w2', message: 'Warning 2', priority: WarningPriority.High },
      ],
    ],
  ])('renders startup warnings: %s', async (warnings) => {
    const appState = {
      startupWarnings: warnings,
      version: '1.0.0',
    } as AppState;
    mockUseAppContext.mockReturnValue(appState);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Notifications />,
      {
        appState,
        settings,
        width: 100,
      },
    );
    await waitUntilReady();
    const output = lastFrame();
    warnings.forEach((warning) => {
      expect(output).toContain(warning.message);
    });
    unmount();
  });

  it('increments show count for low priority warnings', async () => {
    const warnings = [
      { id: 'low-1', message: 'Low priority 1', priority: WarningPriority.Low },
    ];
    const appState = {
      startupWarnings: warnings,
      version: '1.0.0',
    } as AppState;
    mockUseAppContext.mockReturnValue(appState);

    const { waitUntilReady, unmount } = renderWithProviders(<Notifications />, {
      appState,
      settings,
      width: 100,
    });
    await waitUntilReady();

    expect(persistentStateMock.set).toHaveBeenCalledWith(
      'startupWarningCounts',
      { 'low-1': 1 },
    );
    unmount();
  });

  it('filters out low priority warnings that exceeded max show count', async () => {
    const warnings = [
      { id: 'low-1', message: 'Low priority 1', priority: WarningPriority.Low },
      {
        id: 'high-1',
        message: 'High priority 1',
        priority: WarningPriority.High,
      },
    ];
    const appState = {
      startupWarnings: warnings,
      version: '1.0.0',
    } as AppState;
    mockUseAppContext.mockReturnValue(appState);

    persistentStateMock.setData({
      startupWarningCounts: { 'low-1': 3 },
    });

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Notifications />,
      {
        appState,
        settings,
        width: 100,
      },
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).not.toContain('Low priority 1');
    expect(output).toContain('High priority 1');
    unmount();
  });

  it('dismisses warnings on keypress', async () => {
    const warnings = [
      {
        id: 'high-1',
        message: 'High priority 1',
        priority: WarningPriority.High,
      },
    ];
    const appState = {
      startupWarnings: warnings,
      version: '1.0.0',
    } as AppState;
    mockUseAppContext.mockReturnValue(appState);

    const { lastFrame, stdin, waitUntilReady, unmount } = renderWithProviders(
      <Notifications />,
      {
        appState,
        settings,
        width: 100,
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('High priority 1');

    await act(async () => {
      stdin.write('a');
    });
    await waitUntilReady();

    expect(lastFrame({ allowEmpty: true })).not.toContain('High priority 1');
    unmount();
  });

  it('renders init error', async () => {
    const uiState = {
      initError: 'Something went wrong',
      streamingState: 'idle',
      updateInfo: null,
    } as unknown as UIState;
    mockUseUIState.mockReturnValue(uiState);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Notifications />,
      {
        uiState,
        settings,
        width: 100,
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('does not render init error when streaming', async () => {
    const uiState = {
      initError: 'Something went wrong',
      streamingState: 'responding',
      updateInfo: null,
    } as unknown as UIState;
    mockUseUIState.mockReturnValue(uiState);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Notifications />,
      {
        uiState,
        settings,
        width: 100,
      },
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders update notification', async () => {
    const uiState = {
      initError: null,
      streamingState: 'idle',
      updateInfo: { message: 'Update available' },
    } as unknown as UIState;
    mockUseUIState.mockReturnValue(uiState);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Notifications />,
      {
        uiState,
        settings,
        width: 100,
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders screen reader nudge when enabled and not seen (no legacy file)', async () => {
    mockUseIsScreenReaderEnabled.mockReturnValue(true);
    persistentStateMock.setData({ hasSeenScreenReaderNudge: false });
    mockFsAccess.mockRejectedValue(new Error('No legacy file'));

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Notifications />,
      {
        settings,
        width: 100,
      },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('screen reader-friendly view');
    expect(persistentStateMock.set).toHaveBeenCalledWith(
      'hasSeenScreenReaderNudge',
      true,
    );

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('migrates legacy screen reader nudge file', async () => {
    mockUseIsScreenReaderEnabled.mockReturnValue(true);
    persistentStateMock.setData({ hasSeenScreenReaderNudge: undefined });
    mockFsAccess.mockResolvedValue(undefined);

    const { waitUntilReady, unmount } = renderWithProviders(<Notifications />, {
      settings,
      width: 100,
    });

    await act(async () => {
      await waitUntilReady();
      await waitFor(() => {
        expect(persistentStateMock.set).toHaveBeenCalledWith(
          'hasSeenScreenReaderNudge',
          true,
        );
        expect(mockFsUnlink).toHaveBeenCalled();
      });
    });
    unmount();
  });

  it('does not render screen reader nudge when already seen in persistent state', async () => {
    mockUseIsScreenReaderEnabled.mockReturnValue(true);
    persistentStateMock.setData({ hasSeenScreenReaderNudge: true });

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Notifications />,
      {
        settings,
        width: 100,
      },
    );
    await waitUntilReady();

    expect(lastFrame({ allowEmpty: true })).toBe('');
    expect(persistentStateMock.set).not.toHaveBeenCalled();
    unmount();
  });
});
