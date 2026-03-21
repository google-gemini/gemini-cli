/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { render } from '../../test-utils/render.js';
import stripAnsi from 'strip-ansi';
import { AudioWaveform } from './AudioWaveform.js';
import type { VoiceState } from './AudioWaveform.js';

describe('<AudioWaveform />', () => {
  it('renders nothing in idle state', async () => {
    const { lastFrame, waitUntilReady, unmount } = await render(
      <AudioWaveform state="idle" />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it.each(['listening', 'processing', 'speaking', 'error'] as VoiceState[])(
    'renders a non-empty waveform in %s state',
    async (state) => {
      const { lastFrame, waitUntilReady, unmount } = await render(
        <AudioWaveform state={state} width={20} />,
      );
      await waitUntilReady();
      expect(stripAnsi(lastFrame()).trim().length).toBeGreaterThan(0);
      unmount();
    },
  );

  it.each([
    ['listening', 'listening'],
    ['processing', 'processing'],
    ['speaking', 'speaking'],
    ['error', 'error'],
  ] as Array<[VoiceState, string]>)(
    'shows label in %s state',
    async (state, label) => {
      const { lastFrame, waitUntilReady, unmount } = await render(
        <AudioWaveform state={state} width={30} />,
      );
      await waitUntilReady();
      expect(stripAnsi(lastFrame()).trim()).toContain(label);
      unmount();
    },
  );

  it('renders unicode block characters for non-zero amplitudes', async () => {
    const amplitudes = [0.25, 0.5, 0.75, 1.0, 0.75, 0.5, 0.25];
    const { lastFrame, waitUntilReady, unmount } = await render(
      <AudioWaveform state="speaking" amplitudes={amplitudes} width={20} />,
    );
    await waitUntilReady();
    expect(/[▁▂▃▄▅▆▇█]/.test(lastFrame())).toBe(true);
    unmount();
  });

  it('uses all-low bars for all-zero amplitudes', async () => {
    const amplitudes = new Array(10).fill(0);
    const { lastFrame, waitUntilReady, unmount } = await render(
      <AudioWaveform state="listening" amplitudes={amplitudes} width={20} />,
    );
    await waitUntilReady();
    expect(/[▃▄▅▆▇█]/.test(lastFrame())).toBe(false);
    unmount();
  });

  it('uses all-full bars for all-one amplitudes', async () => {
    const amplitudes = new Array(10).fill(1.0);
    const { lastFrame, waitUntilReady, unmount } = await render(
      <AudioWaveform state="speaking" amplitudes={amplitudes} width={20} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('█');
    unmount();
  });

  it('generates synthetic animation in listening state', async () => {
    const { lastFrameRaw, waitUntilReady, unmount } = await render(
      <AudioWaveform state="listening" width={20} />,
    );
    await waitUntilReady();
    const frame1 = stripAnsi(lastFrameRaw()).trim();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const frame2 = stripAnsi(lastFrameRaw()).trim();
    expect(frame1.length).toBeGreaterThan(0);
    expect(frame2.length).toBeGreaterThan(0);
    expect(frame1).not.toBe(frame2);
    unmount();
  });

  it('error state is static', async () => {
    const { lastFrame, waitUntilReady, unmount } = await render(
      <AudioWaveform state="error" width={20} />,
    );
    await waitUntilReady();
    const frame1 = stripAnsi(lastFrame()).trim();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const frame2 = stripAnsi(lastFrame()).trim();
    expect(frame1).toBe(frame2);
    unmount();
  });

  it('respects a narrow width', async () => {
    const { lastFrame, waitUntilReady, unmount } = await render(
      <AudioWaveform
        state="listening"
        amplitudes={new Array(5).fill(1.0)}
        width={10}
      />,
    );
    await waitUntilReady();
    const text = stripAnsi(lastFrame()).replace('listening', '').trim();
    expect(text.length).toBeLessThanOrEqual(10);
    unmount();
  });
});
