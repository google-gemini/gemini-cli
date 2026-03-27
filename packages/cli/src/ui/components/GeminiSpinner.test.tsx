/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { GeminiSpinner } from './GeminiSpinner.js';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { useIsScreenReaderEnabled } from 'ink';

vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useIsScreenReaderEnabled: vi.fn(),
  };
});

describe('<GeminiSpinner />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should render CircularSpinner when screen reader is disabled', async () => {
    vi.mocked(useIsScreenReaderEnabled).mockReturnValue(false);

    // We wrap render in act to handle the initial effect
    let renderResult;
    await act(async () => {
      renderResult = await renderWithProviders(<GeminiSpinner />);
    });

    const { lastFrame, unmount } = renderResult!;

    // Advance timers to trigger at least one state update
    await act(async () => {
      vi.advanceTimersByTime(30);
    });

    // Component renders immediately.
    expect(lastFrame()).toBeTruthy();

    await act(async () => {
      unmount();
    });
  });

  it('should render altText when screen reader is enabled', async () => {
    vi.mocked(useIsScreenReaderEnabled).mockReturnValue(true);

    let renderResult;
    await act(async () => {
      renderResult = await renderWithProviders(
        <GeminiSpinner altText="Custom Loading" />,
      );
    });

    const { lastFrame, unmount } = renderResult!;

    expect(lastFrame()?.trim()).toBe('Custom Loading');

    await act(async () => {
      unmount();
    });
  });
});
