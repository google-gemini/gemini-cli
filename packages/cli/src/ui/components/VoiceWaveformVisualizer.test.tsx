/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { render } from '../../test-utils/render.js';
import { VoiceWaveformVisualizer } from './VoiceWaveformVisualizer.js';
import { describe, it, expect } from 'vitest';

describe('VoiceWaveformVisualizer', () => {
  it('renders nothing when idle', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <VoiceWaveformVisualizer state="idle" />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders listening label', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <VoiceWaveformVisualizer state="listening" />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Listening');
    unmount();
  });

  it('renders processing label', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <VoiceWaveformVisualizer state="processing" />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Processing');
    unmount();
  });

  it('renders speaking label', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <VoiceWaveformVisualizer state="speaking" />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Speaking');
    unmount();
  });
});
