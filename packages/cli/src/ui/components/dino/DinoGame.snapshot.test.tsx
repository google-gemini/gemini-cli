/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders as render } from '../../../test-utils/render.js';
import { act } from 'react';
import { DinoGame } from './DinoGame.js';

// Mock useTerminalSize to return a configurable size for snapshots
const terminalSize = vi.hoisted(() => ({ columns: 100, rows: 24 }));
vi.mock('../../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => terminalSize,
}));

describe('DinoGame Snapshots', () => {
  beforeEach(() => {
    // Reset to default before each test
    terminalSize.columns = 100;
    terminalSize.rows = 24;

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

  it('matches snapshot while ducking', async () => {
    const { lastFrame, stdin, unmount } = render(<DinoGame />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // Start game
    await act(async () => {
      stdin.write(' ');
      await vi.runOnlyPendingTimersAsync();
    });

    // Duck
    await act(async () => {
      stdin.write('\x1b[B'); // Down arrow
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(lastFrame()).toMatchSnapshot();

    unmount();
  });

  it('matches snapshot with debug cactus', async () => {
    const { lastFrame, stdin, unmount } = render(<DinoGame />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // Start game
    await act(async () => {
      stdin.write(' ');
      await vi.runOnlyPendingTimersAsync();
    });

    // Spawn cactus
    await act(async () => {
      stdin.write('c');
      await vi.runOnlyPendingTimersAsync();
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

  it('matches snapshot for game over with stretched sprite text', async () => {
    terminalSize.columns = 150; // 300 dots, enough for sprites (207 dots) but stretched
    const { lastFrame, stdin, unmount } = render(<DinoGame />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // Start and die immediately
    await act(async () => {
      stdin.write(' ');
      await vi.runOnlyPendingTimersAsync();
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('matches snapshot for game over with max width sprite text', async () => {
    terminalSize.columns = 200; // 400 dots, capped at 384 dots for text
    const { lastFrame, stdin, unmount } = render(<DinoGame />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // Start and die immediately
    await act(async () => {
      stdin.write(' ');
      await vi.runOnlyPendingTimersAsync();
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('matches snapshot with sprite score when height is large', async () => {
    terminalSize.columns = 150; // Ensure enough width for sprite score
    const { lastFrame, unmount } = render(<DinoGame availableHeight={40} />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders successfully in a very narrow terminal', async () => {
    terminalSize.columns = 20; // 40 dots wide
    const { lastFrame, unmount } = render(<DinoGame />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
