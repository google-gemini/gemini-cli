/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Text, useIsScreenReaderEnabled } from 'ink';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { GeminiSpinner } from './GeminiSpinner.js';

vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    useIsScreenReaderEnabled: vi.fn(),
  };
});

vi.mock('./CliSpinner.js', () => ({
  CliSpinner: () => <Text>MockCliSpinner</Text>,
}));

describe('<GeminiSpinner />', () => {
  const mockUseIsScreenReaderEnabled = vi.mocked(useIsScreenReaderEnabled);

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('TMUX', '');
    vi.stubEnv('TERM', '');
    mockUseIsScreenReaderEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('renders the normal spinner when not in tmux', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <GeminiSpinner />,
    );

    await waitUntilReady();

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders a tmux-safe fixed-width dots indicator when in tmux', async () => {
    vi.useFakeTimers();
    vi.stubEnv('TMUX', '/tmp/tmux-1000/default,123,0');
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <GeminiSpinner />,
    );

    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();

    unmount();
  });

  it('renders alt text for screen readers', async () => {
    mockUseIsScreenReaderEnabled.mockReturnValue(true);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <GeminiSpinner altText="Responding" />,
    );

    await waitUntilReady();

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
