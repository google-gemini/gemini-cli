/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { Box, Text } from 'ink';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { CliSpinner, TMUX_SPINNER_INTERVAL_MS } from './CliSpinner.js';
import { debugState } from '../debug.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('<CliSpinner />', () => {
  beforeEach(() => {
    debugState.debugNumAnimatedComponents = 0;
    vi.stubEnv('TMUX', '');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('should increment debugNumAnimatedComponents on mount and decrement on unmount', async () => {
    expect(debugState.debugNumAnimatedComponents).toBe(0);
    const { unmount } = await renderWithProviders(<CliSpinner />);
    expect(debugState.debugNumAnimatedComponents).toBe(1);
    unmount();
    expect(debugState.debugNumAnimatedComponents).toBe(0);
  });

  it('should not render when showSpinner is false', async () => {
    const settings = createMockSettings({ ui: { showSpinner: false } });
    const { lastFrame, unmount } = await renderWithProviders(<CliSpinner />, {
      settings,
    });
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('throttles spinner ticks in tmux and does not re-render parent or sibling components', async () => {
    vi.useFakeTimers();
    vi.stubEnv('TMUX', '/tmp/tmux-1000/default,123,0');

    let parentRenders = 0;
    let siblingRenders = 0;

    const Sibling = React.memo(() => {
      siblingRenders++;
      return <Text>Sibling</Text>;
    });
    Sibling.displayName = 'Sibling';

    const Parent = () => {
      parentRenders++;
      return (
        <Box>
          <CliSpinner type="dots" />
          <Sibling />
        </Box>
      );
    };

    const { lastFrame, unmount } = await renderWithProviders(<Parent />);
    const initialFrame = lastFrame();
    expect(parentRenders).toBe(1);
    expect(siblingRenders).toBe(1);

    // Advance by 80ms (standard dots interval) - should not have ticked yet in tmux (throttled to 120ms)
    await act(async () => {
      vi.advanceTimersByTime(80);
    });
    expect(lastFrame()).toBe(initialFrame);

    // Advance to 120ms - should advance spinner frame without re-rendering Parent or Sibling
    await act(async () => {
      vi.advanceTimersByTime(TMUX_SPINNER_INTERVAL_MS - 80);
    });
    expect(lastFrame()).not.toBe(initialFrame);
    expect(parentRenders).toBe(1);
    expect(siblingRenders).toBe(1);

    unmount();
  });
});
