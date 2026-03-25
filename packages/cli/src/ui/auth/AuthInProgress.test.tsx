/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { AuthInProgress } from './AuthInProgress.js';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { act } from 'react';
import { Text } from 'ink';
import { useKeypress } from '../hooks/useKeypress.js';

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

const mockedUseKeypress = useKeypress as Mock;

vi.mock('../components/BrailleAnimation.js', () => ({
  BrailleAnimation: () => <Text>[Spinner]</Text>,
}));

describe('AuthInProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders initial state with spinner', async () => {
    const onTimeout = vi.fn();
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <AuthInProgress onTimeout={onTimeout} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('[Spinner] Waiting for authentication...');
    expect(lastFrame()).toContain('Press Esc or Ctrl+C to cancel');
    unmount();
  });

  it('calls onTimeout when ESC is pressed', async () => {
    const onTimeout = vi.fn();
    const { unmount } = await renderWithProviders(
      <AuthInProgress onTimeout={onTimeout} />,
    );

    const keypressHandler = mockedUseKeypress.mock.calls[0][0];
    await act(async () => {
      keypressHandler({ name: 'escape' });
    });

    expect(onTimeout).toHaveBeenCalled();
    unmount();
  });

  it('calls onTimeout when Ctrl+C is pressed', async () => {
    const onTimeout = vi.fn();
    const { unmount } = await renderWithProviders(
      <AuthInProgress onTimeout={onTimeout} />,
    );

    const keypressHandler = mockedUseKeypress.mock.calls[0][0];
    await act(async () => {
      keypressHandler({ ctrl: true, name: 'c' });
    });

    expect(onTimeout).toHaveBeenCalled();
    unmount();
  });

  it('calls onTimeout and shows timeout message after 3 minutes', async () => {
    const onTimeout = vi.fn();
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <AuthInProgress onTimeout={onTimeout} />,
    );
    await waitUntilReady();

    await act(async () => {
      vi.advanceTimersByTime(180000);
    });

    // Wait for state updates to propagate
    await waitUntilReady();

    expect(onTimeout).toHaveBeenCalled();
    expect(lastFrame()).toContain('Authentication timed out');
    unmount();
  });

  it('clears timer on unmount', async () => {
    const onTimeout = vi.fn();
    const { unmount, waitUntilReady } = await renderWithProviders(
      <AuthInProgress onTimeout={onTimeout} />,
    );
    await waitUntilReady();

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(180000);
    });

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
