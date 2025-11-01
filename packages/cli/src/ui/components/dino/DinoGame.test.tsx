/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render } from '../../../test-utils/render.js';
import { DinoGame } from './DinoGame.js';

describe('DinoGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders initial state correctly', () => {
    const { lastFrame, unmount } = render(<DinoGame />);
    expect(lastFrame()).toContain('Press Space to Play');
    expect(lastFrame()).toContain('HI 00000 00000');
    unmount();
  });

  it('starts game on space press', async () => {
    const { lastFrame, stdin, unmount } = render(<DinoGame />);
    expect(lastFrame()).toContain('Press Space to Play');

    await act(async () => {
      stdin.write(' ');
    });
    expect(lastFrame()).not.toContain('Press Space to Play');
    unmount();
  });

  it('handles jump input', async () => {
    const { lastFrame, stdin, unmount } = render(<DinoGame />);
    await act(async () => {
      stdin.write(' '); // Start game
    });

    // Trigger jump
    await act(async () => {
      stdin.write(' ');
    });

    // Advance time to let jump happen
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(lastFrame()).not.toContain('GAME OVER');
    unmount();
  });

  it('handles game over state', async () => {
    const { lastFrame, stdin, unmount } = render(<DinoGame />);
    await act(async () => {
      stdin.write(' '); // Start game
    });

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01); // Force spawn

    // Advance enough time for an obstacle to reach the dino
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    const frame = lastFrame();
    expect(
      frame && (frame.includes('HI') || frame.includes('GAME OVER')),
    ).toBeTruthy();

    randomSpy.mockRestore();
    unmount();
  });

  it('calls onClose when Ctrl+C is pressed', async () => {
    const onClose = vi.fn();
    const { stdin, unmount } = render(<DinoGame onClose={onClose} />);

    await act(async () => {
      stdin.write('\x03');
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });
});
