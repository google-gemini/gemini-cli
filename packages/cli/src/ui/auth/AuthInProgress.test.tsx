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
        // eslint-disable-next-line no-restricted-syntax
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

  it('renders initial state with spinner', async () => {
    const { lastFrame, unmount } = await render(
      <AuthInProgress onTimeout={onTimeout} />,
    );
    expect(lastFrame()).toContain('[Spinner] Waiting for authentication...');
    expect(lastFrame()).toContain('Press Esc or Ctrl+C to cancel');
    unmount();
  });

  it('calls onTimeout when ESC is pressed', async () => {
    const { waitUntilReady, unmount } = await render(
      <AuthInProgress onTimeout={onTimeout} />,
    );
    const keypressHandler = vi.mocked(useKeypress).mock.calls[0][0];

    await act(async () => {
      keypressHandler({ name: 'escape' } as unknown as Key);
    });
    // Escape key has a 50ms timeout in KeypressContext, so we need to wrap waitUntilReady in act
    await act(async () => {
      await waitUntilReady();
    });

    expect(onTimeout).toHaveBeenCalled();
    unmount();
  });

  it('calls onTimeout when Ctrl+C is pressed', async () => {
    const { waitUntilReady, unmount } = await render(
      <AuthInProgress onTimeout={onTimeout} />,
    );
    const keypressHandler = vi.mocked(useKeypress).mock.calls[0][0];

    await act(async () => {
      keypressHandler({ name: 'c', ctrl: true } as unknown as Key);
    });
    await waitUntilReady();

    expect(onTimeout).toHaveBeenCalled();
    unmount();
  });

  it('calls onTimeout and shows timeout message after 3 minutes', async () => {
    const { lastFrame, waitUntilReady, unmount } = await render(
      <AuthInProgress onTimeout={onTimeout} />,
    );

    await act(async () => {
      vi.advanceTimersByTime(180000);
    });
    await waitUntilReady();

    expect(onTimeout).toHaveBeenCalled();
    expect(lastFrame()).toContain('Authentication timed out');
    unmount();
  });

  it('clears timer on unmount', async () => {
    const { unmount } = await render(<AuthInProgress onTimeout={onTimeout} />);

    await act(async () => {
      unmount();
    });

    await act(async () => {
      vi.advanceTimersByTime(180000);
    });
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
