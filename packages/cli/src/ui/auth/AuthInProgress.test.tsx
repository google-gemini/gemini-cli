/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../../test-utils/render.js';
import { act } from 'react';
import { AuthInProgress } from './AuthInProgress.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { debugLogger } from '@google/gemini-cli-core';

// Mock dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../components/CliSpinner.js', () => ({
  CliSpinner: () => '[Spinner]',
}));

describe('AuthInProgress', () => {
  const onTimeout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(debugLogger.error).mockImplementation((...args) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('was not wrapped in act')
      ) {
        return;
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders initial state with spinner', () => {
    const { lastFrame } = render(<AuthInProgress onTimeout={onTimeout} />);
    expect(lastFrame()).toContain('[Spinner] Waiting for auth...');
    expect(lastFrame()).toContain('Press ESC or CTRL+C to cancel');
  });

  it('calls onTimeout when ESC is pressed', () => {
    render(<AuthInProgress onTimeout={onTimeout} />);
    const keypressHandler = vi.mocked(useKeypress).mock.calls[0][0];

    keypressHandler({ name: 'escape' } as unknown as Key);
    expect(onTimeout).toHaveBeenCalled();
  });

  it('calls onTimeout when Ctrl+C is pressed', () => {
    render(<AuthInProgress onTimeout={onTimeout} />);
    const keypressHandler = vi.mocked(useKeypress).mock.calls[0][0];

    keypressHandler({ name: 'c', ctrl: true } as unknown as Key);
    expect(onTimeout).toHaveBeenCalled();
  });

  it('calls onTimeout and shows timeout message after 3 minutes', async () => {
    const { lastFrame } = render(<AuthInProgress onTimeout={onTimeout} />);

    await act(async () => {
      vi.advanceTimersByTime(180000);
    });

    expect(onTimeout).toHaveBeenCalled();
    await vi.waitUntil(
      () => lastFrame()?.includes('Authentication timed out'),
      { timeout: 1000 },
    );
  });

  it('clears timer on unmount', () => {
    const { unmount } = render(<AuthInProgress onTimeout={onTimeout} />);
    act(() => {
      unmount();
    });
    vi.advanceTimersByTime(180000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
