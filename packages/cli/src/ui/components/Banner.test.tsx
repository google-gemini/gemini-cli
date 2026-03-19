/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { Banner } from './Banner.js';
import { describe, it, expect } from 'vitest';

describe('Banner', () => {
  it.each([
    ['warning mode', true, 'Warning Message'],
    ['info mode', false, 'Info Message'],
    ['multi-line warning', true, 'Title Line\\nBody Line 1\\nBody Line 2'],
  ])('renders in %s', async (_, isWarning, text) => {
    const renderResult = renderWithProviders(
      <Banner bannerText={text} isWarning={isWarning} width={80} />,
    );
    await renderResult.waitUntilReady();
    await expect(renderResult).toMatchSvgSnapshot();
    renderResult.unmount();
  });

  it('handles newlines in text', async () => {
    const text = 'Line 1\\nLine 2';
    const renderResult = renderWithProviders(
      <Banner bannerText={text} isWarning={false} width={80} />,
    );
    await renderResult.waitUntilReady();
    await expect(renderResult).toMatchSvgSnapshot();
    renderResult.unmount();
  });
});
