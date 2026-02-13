/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, persistentStateMock } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { Notifications } from './Notifications.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppContext, type AppState } from '../contexts/AppContext.js';
import { useUIState, type UIState } from '../contexts/UIStateContext.js';
import { useIsScreenReaderEnabled } from 'ink';
import * as fs from 'node:fs/promises';
import { act } from 'react';

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
    Storage: {
      ...actual.Storage,
      getGlobalTempDir: () => '/mock/temp',
    },
  };
});

vi.mock('../../config/settings.js', () => ({
  DEFAULT_MODEL_CONFIGS: {},
  LoadedSettings: class {
    constructor() {
      // this.merged = {};
    }
  },
}));

describe('Notifications', () => {
  const mockUseAppContext = vi.mocked(useAppContext);
  const mockUseUIState = vi.mocked(useUIState);
  const mockUseIsScreenReaderEnabled = vi.mocked(useIsScreenReaderEnabled);
  const mockFsAccess = vi.mocked(fs.access);
  const mockFsUnlink = vi.mocked(fs.unlink);

  beforeEach(() => {
    vi.clearAllMocks();
    persistentStateMock.reset();
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

  it('renders nothing when no notifications', () => {
    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toBe('');
  });

  it.each([[['Warning 1']], [['Warning 1', 'Warning 2']]])(
    'renders startup warnings: %s',
    (warnings) => {
      mockUseAppContext.mockReturnValue({
        startupWarnings: warnings,
        version: '1.0.0',
      } as AppState);
      const { lastFrame } = render(<Notifications />);
      const output = lastFrame();
      warnings.forEach((warning) => {
        expect(output).toContain(warning);
      });
    },
  );

  it('renders init error', () => {
    mockUseUIState.mockReturnValue({
      initError: 'Something went wrong',
      streamingState: 'idle',
      updateInfo: null,
    } as unknown as UIState);
    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('does not render init error when streaming', () => {
    mockUseUIState.mockReturnValue({
      initError: 'Something went wrong',
      streamingState: 'responding',
      updateInfo: null,
    } as unknown as UIState);
    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toBe('');
  });

  it('renders update notification', () => {
    mockUseUIState.mockReturnValue({
      initError: null,
      streamingState: 'idle',
      updateInfo: { message: 'Update available' },
    } as unknown as UIState);
    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders screen reader nudge when enabled and not seen (no legacy file)', async () => {
    mockUseIsScreenReaderEnabled.mockReturnValue(true);
    persistentStateMock.setData({ hasSeenScreenReaderNudge: false });
    mockFsAccess.mockRejectedValue(new Error('No legacy file'));

    const { lastFrame } = render(<Notifications />);

    expect(lastFrame()).toContain('screen reader-friendly view');
    expect(persistentStateMock.set).toHaveBeenCalledWith(
      'hasSeenScreenReaderNudge',
      true,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('migrates legacy screen reader nudge file', async () => {
    mockUseIsScreenReaderEnabled.mockReturnValue(true);
    persistentStateMock.setData({ hasSeenScreenReaderNudge: undefined });
    mockFsAccess.mockResolvedValue(undefined);

    render(<Notifications />);

    await act(async () => {
      await waitFor(() => {
        expect(persistentStateMock.set).toHaveBeenCalledWith(
          'hasSeenScreenReaderNudge',
          true,
        );
        expect(mockFsUnlink).toHaveBeenCalled();
      });
    });
  });

  it('does not render screen reader nudge when already seen in persistent state', async () => {
    mockUseIsScreenReaderEnabled.mockReturnValue(true);
    persistentStateMock.setData({ hasSeenScreenReaderNudge: true });

    const { lastFrame } = render(<Notifications />);

    expect(lastFrame()).toBe('');
    expect(persistentStateMock.set).not.toHaveBeenCalled();
  });
});
