/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { CircularSpinner } from './CircularSpinner.js';
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('<CircularSpinner />', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render the static frame correctly', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <CircularSpinner variant="Static" />,
    );
    await waitUntilReady();
    expect(lastFrame()?.trim()).toBe('⢎⡱');
  });

  it('should render Small variant frames (tail length 2)', async () => {
    const {
      lastFrame: lastFrame0,
      waitUntilReady: wait0,
      rerender,
    } = await renderWithProviders(
      <CircularSpinner variant="Small" frameIndex={0} />,
    );
    await wait0();
    // Frame 0: idx 0, 7
    // bits1 = 0x08 (⠈), bits2 = 0x01 (⠁)
    expect(lastFrame0({ allowEmpty: true })?.trim()).toBe('⠈⠁');

    await act(async () => {
      rerender(<CircularSpinner variant="Small" frameIndex={1} />);
    });
    await wait0();
    // Frame 1: idx 1, 0
    // bits1 = 0, bits2 = 0x11 (⠑)
    expect(lastFrame0({ allowEmpty: true })?.trim()).toBe('⠀⠑');

    await act(async () => {
      rerender(<CircularSpinner variant="Small" frameIndex={2} />);
    });
    await wait0();
    // Frame 2: idx 2, 1
    // bits2 = 0x30 (⠰)
    expect(lastFrame0({ allowEmpty: true })?.trim()).toBe('⠀⠰');
  });

  it('should render Medium variant frames (tail length 3)', async () => {
    const { lastFrame, waitUntilReady, rerender } = await renderWithProviders(
      <CircularSpinner variant="Medium" frameIndex={0} />,
    );
    await waitUntilReady();

    // Frame 0: idx 0, 7, 6
    // bits1 = 0x0A (⠊), bits2 = 0x01 (⠁)
    expect(lastFrame({ allowEmpty: true })?.trim()).toBe('⠊⠁');

    await act(async () => {
      rerender(<CircularSpinner variant="Medium" frameIndex={1} />);
    });
    await waitUntilReady();
    // Frame 1: idx 1, 0, 7
    // bits1 = 0x08 (⠈), bits2 = 0x11 (⠑)
    expect(lastFrame({ allowEmpty: true })?.trim()).toBe('⠈⠑');
  });

  it('should render Composite variant frames (12 ticks/shift)', async () => {
    const { lastFrame, rerender, waitUntilReady } = await renderWithProviders(
      <CircularSpinner variant="Composite" frameIndex={0} />,
    );
    await waitUntilReady();

    // index 0: length 2
    expect(lastFrame({ allowEmpty: true })?.trim()).toBe('⠈⠁');

    await act(async () => {
      rerender(<CircularSpinner variant="Composite" frameIndex={11} />);
    });
    await waitUntilReady();
    // index 11: length 2, head shifted 11 mod 8 = 3 (C2.7)
    // DOTS[3] = {0, 0x40}, DOTS[2] = {0, 0x20}
    // bits2 = 0x40 | 0x20 = 0x60 (⠠)
    // Actually the logic is: bits1 |= DOTS[idx].c1; bits2 |= DOTS[idx].c2;
    // idx for i=0: (11-0+8)%8 = 3. idx for i=1: (11-1+8)%8 = 2.
    // DOTS[3] = {c1:0, c2:0x40}. DOTS[2] = {c1:0, c2:0x20}.
    // bits2 = 0x60. char2 = U+2860 (⡠). Wait, 0x2800 + 0x60 = 0x2860.
    // Let me check braille chart for 0x60.
    expect(lastFrame({ allowEmpty: true })?.trim()).toBe('⠀⡠');

    await act(async () => {
      rerender(<CircularSpinner variant="Composite" frameIndex={12} />);
    });
    await waitUntilReady();
    // index 12: length 3, head shifted 12 mod 8 = 4 (C1.8)
    // DOTS[4] = {0x80, 0}, DOTS[3] = {0, 0x40}, DOTS[2] = {0, 0x20}
    // bits1 = 0x80 (⢀), bits2 = 0x40 | 0x20 = 0x60 (⡠)
    expect(lastFrame({ allowEmpty: true })?.trim()).toBe('⢀⡠');
  });

  it('should handle showSpinner setting', async () => {
    const settings = createMockSettings({
      merged: {
        ui: { showSpinner: false },
      },
    });

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <CircularSpinner />,
      { settings },
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })?.trim()).toBe('');
  });
});
