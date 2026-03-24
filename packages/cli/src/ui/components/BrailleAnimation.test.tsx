/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { BrailleAnimation } from './BrailleAnimation.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createMockSettings } from '../../test-utils/settings.js';

describe('BrailleAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should grow from length 1 to 5 and match verification frames', async () => {
    const settings = createMockSettings({
      merged: {
        ui: {
          showSpinner: true,
        },
      },
    });

    // renderWithProviders will call waitUntilReady once.
    const renderResult = await renderWithProviders(
      <BrailleAnimation interval={100} variant="Long" animate={true} />,
      { settings },
    );

    const { lastFrameRaw } = renderResult;

    const verificationFrames = [
      '⢎⠁', // 0
      '⠎⠑', // 1
      '⠊⠱', // 2
      '⠈⡱', // 3
      '⢀⡱', // 4
      '⢄⡰', // 5
      '⢆⡠', // 6
      '⢎⡀', // 7
    ];

    // Advance 16 ticks to reach length 5.
    for (let i = 0; i < 16; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }

    // Now check the sequence.
    let current = lastFrameRaw();
    let startIdx = verificationFrames.findIndex((f) => current.includes(f));

    if (startIdx === -1) {
      for (let attempt = 0; attempt < 8; attempt++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100);
        });
        current = lastFrameRaw();
        startIdx = verificationFrames.findIndex((f) => current.includes(f));
        if (startIdx !== -1) break;
      }
    }

    expect(
      startIdx,
      `Should have reached length 5 frames. Current: ${current}`,
    ).not.toBe(-1);

    // Verify the sequence.
    for (let i = 0; i < 8; i++) {
      const idx = (startIdx + i) % 8;
      expect(lastFrameRaw()).toContain(verificationFrames[idx]);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }

    act(() => {
      renderResult.unmount();
    });
  });

  it('should support "Composite" variant with dynamic lengths', async () => {
    const renderResult = await renderWithProviders(
      <BrailleAnimation interval={100} variant="Composite" animate={true} />,
    );

    // Just verify it renders something
    expect(renderResult.lastFrameRaw()).toBeTruthy();

    act(() => {
      renderResult.unmount();
    });
  });
});
