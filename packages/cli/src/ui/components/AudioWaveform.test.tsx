/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import stripAnsi from 'strip-ansi';
import { AudioWaveform } from './AudioWaveform.js';
import type { VoiceState } from './AudioWaveform.js';

describe('<AudioWaveform />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── idle ─────────────────────────────────────────────────────────────────

  it('renders nothing in idle state', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <AudioWaveform state="idle" />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  // ── active states render content ─────────────────────────────────────────

  it.each(['listening', 'processing', 'speaking', 'error'] as VoiceState[])(
    'renders a non-empty waveform in %s state',
    async (state) => {
      const { lastFrame, waitUntilReady, unmount } = render(
        <AudioWaveform state={state} width={20} />,
      );
      await waitUntilReady();
      expect(stripAnsi(lastFrame()).trim().length).toBeGreaterThan(0);
      unmount();
    },
  );

  // ── state labels ─────────────────────────────────────────────────────────

  it.each([
    ['listening', 'listening'],
    ['processing', 'processing'],
    ['speaking', 'speaking'],
    ['error', 'error'],
  ] as Array<[VoiceState, string]>)(
    'shows "%s" label in %s state',
    async (state, label) => {
      const { lastFrame, waitUntilReady, unmount } = render(
        <AudioWaveform state={state} width={30} />,
      );
      await waitUntilReady();
      expect(stripAnsi(lastFrame()).trim()).toContain(label);
      unmount();
    },
  );

  // ── block characters ──────────────────────────────────────────────────────

  it('renders unicode block characters for non-zero amplitudes', async () => {
    const amplitudes = [0.25, 0.5, 0.75, 1.0, 0.75, 0.5, 0.25];
    const { lastFrame, waitUntilReady, unmount } = render(
      <AudioWaveform state="speaking" amplitudes={amplitudes} width={20} />,
    );
    await waitUntilReady();
    expect(/[▁▂▃▄▅▆▇█]/.test(lastFrame())).toBe(true);
    unmount();
  });

  it('uses all-low bars for all-zero amplitudes', async () => {
    const amplitudes = new Array(10).fill(0);
    const { lastFrame, waitUntilReady, unmount } = render(
      <AudioWaveform state="listening" amplitudes={amplitudes} width={20} />,
    );
    await waitUntilReady();
    // amplitude=0 maps to index 0 → ' ' (space); higher chars should be absent
    const text = lastFrame();
    expect(/[▃▄▅▆▇█]/.test(text)).toBe(false);
    unmount();
  });

  it('uses all-full bars for all-one amplitudes', async () => {
    const amplitudes = new Array(10).fill(1.0);
    const { lastFrame, waitUntilReady, unmount } = render(
      <AudioWaveform state="speaking" amplitudes={amplitudes} width={20} />,
    );
    await waitUntilReady();
    // amplitude=1 maps to '█'
    expect(lastFrame()).toContain('█');
    unmount();
  });

  // ── animation ────────────────────────────────────────────────────────────

  it('generates synthetic animation in listening state (frames differ over time)', async () => {
    const { lastFrameRaw, waitUntilReady, unmount } = render(
      <AudioWaveform state="listening" width={20} />,
    );
    await waitUntilReady();
    const frame1 = stripAnsi(lastFrameRaw()).trim();

    // Advance by enough ticks to guarantee a visually different frame.
    // The sine wave shifts by tick*0.3 rad/tick; ~21 ticks complete one full
    // cycle (2π / 0.3 ≈ 21).  500ms at 80ms/tick = ~6 ticks — well within
    // the first half-period where every tick changes at least one bar.
    // Use lastFrameRaw() (Ink's raw output) rather than lastFrame() (xterm
    // buffer) to avoid the async write queue blocking the read.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    const frame2 = stripAnsi(lastFrameRaw()).trim();

    // Both frames should be non-empty and the waveform should have changed.
    expect(frame1.length).toBeGreaterThan(0);
    expect(frame2.length).toBeGreaterThan(0);
    expect(frame1).not.toBe(frame2);
    unmount();
  });

  it('error state is static (no animation)', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <AudioWaveform state="error" width={20} />,
    );
    await waitUntilReady();
    const frame1 = stripAnsi(lastFrame()).trim();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    const frame2 = stripAnsi(lastFrame()).trim();

    expect(frame1).toBe(frame2);
    unmount();
  });

  // ── width ─────────────────────────────────────────────────────────────────

  it('respects a narrow width', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <AudioWaveform
        state="listening"
        amplitudes={new Array(5).fill(1.0)}
        width={10}
      />,
    );
    await waitUntilReady();
    // Strip ANSI and label; remaining bar section should be short
    const text = stripAnsi(lastFrame()).replace('listening', '').trim();
    // bar section width ≤ requested width
    expect(text.length).toBeLessThanOrEqual(10);
    unmount();
  });
});
