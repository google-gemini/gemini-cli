/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ProgressBar } from './ProgressBar.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('<ProgressBar />', () => {
  it('renders 0% correctly', async () => {
    const { lastFrame } = await renderWithProviders(
      <ProgressBar value={0} width={10} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders 50% correctly', async () => {
    const { lastFrame } = await renderWithProviders(
      <ProgressBar value={50} width={10} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders warning threshold correctly', async () => {
    const { lastFrame } = await renderWithProviders(
      <ProgressBar value={85} width={10} warningThreshold={80} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders error threshold correctly at 100%', async () => {
    const { lastFrame } = await renderWithProviders(
      <ProgressBar value={100} width={10} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles negative, zero, and fractional widths without throwing', async () => {
    const { lastFrame: frameNeg } = await renderWithProviders(
      <ProgressBar value={50} width={-5} />,
    );
    expect(frameNeg({ allowEmpty: true })).toBeDefined();

    const { lastFrame: frameZero } = await renderWithProviders(
      <ProgressBar value={50} width={0} />,
    );
    expect(frameZero({ allowEmpty: true })).toBeDefined();

    const { lastFrame: frameFrac } = await renderWithProviders(
      <ProgressBar value={50} width={10.7} />,
    );
    expect(frameFrac()).toBeDefined();
  });

  it.each([NaN, undefined as unknown as number, Infinity, -Infinity])(
    'handles non-finite value (%s) without throwing',
    async (val) => {
      const { lastFrame } = await renderWithProviders(
        <ProgressBar value={val} width={10} />,
      );
      expect(lastFrame()).toBeDefined();
    },
  );
});
