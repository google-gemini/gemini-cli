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
    mockUseIsScreenReaderEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('renders the normal spinner when not in tmux', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <GeminiSpinner />,
    );

    await waitUntilReady();

    expect(lastFrame()).toContain('MockCliSpinner');
    unmount();
  });

  it('renders a tmux-safe fixed-width dots indicator when in tmux', async () => {
    vi.useFakeTimers();
    vi.stubEnv('TMUX', '/tmp/tmux-1000/default,123,0');
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <GeminiSpinner />,
    );

    await waitUntilReady();
    expect(lastFrame()).toContain('.');
    expect(lastFrame()).not.toContain('MockCliSpinner');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    await waitUntilReady();
    expect(lastFrame()).toContain('..');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    await waitUntilReady();
    expect(lastFrame()).toContain('...');

    unmount();
  });

  it('renders alt text for screen readers', async () => {
    mockUseIsScreenReaderEnabled.mockReturnValue(true);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <GeminiSpinner altText="Responding" />,
    );

    await waitUntilReady();

    expect(lastFrame()).toContain('Responding');
    expect(lastFrame()).not.toContain('MockCliSpinner');
    unmount();
  });
});
