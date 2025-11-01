/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../../../test-utils/render.js';
import { act } from 'react';
import { DinoGame } from './DinoGame.js';

// Mock useTerminalSize to return a fixed size for snapshots
vi.mock('../../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ columns: 100, rows: 24 }),
}));

describe('DinoGame Snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock Math.random for deterministic ground/cloud/obstacle generation
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('matches snapshot for initial state', async () => {
    const { lastFrame, unmount } = render(<DinoGame />);
    // Flush any Ink internal timers
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(lastFrame()).toMatchSnapshot();

    unmount();
  });

  it('matches snapshot while playing', async () => {
    const { lastFrame, stdin, unmount } = render(<DinoGame />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // Start game
    await act(async () => {
      stdin.write(' ');
      await vi.runOnlyPendingTimersAsync();
    });

    // Advance time a bit to have some movement
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(lastFrame()).toMatchSnapshot();

    unmount();
  });

  it('matches snapshot for game over state', async () => {
    const { lastFrame, stdin, unmount } = render(<DinoGame />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // Start game
    await act(async () => {
      stdin.write(' ');
      await vi.runOnlyPendingTimersAsync();
    });

    // Force spawn an obstacle immediately by overriding the mock for a moment
    // We need a value < 0.03 to spawn obstacle
    vi.spyOn(Math, 'random').mockReturnValue(0.01);

    // Advance enough time for collision
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(lastFrame()).toMatchSnapshot();

    unmount();
  });
});
