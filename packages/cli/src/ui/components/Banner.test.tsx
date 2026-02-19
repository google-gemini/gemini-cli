/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { Banner } from './Banner.js';
import { describe, it, expect } from 'vitest';

describe('Banner', () => {
  it.each([
    ['warning mode', true, 'Warning Message'],
    ['info mode', false, 'Info Message'],
  ])('renders in %s', async (_, isWarning, text) => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <Banner bannerText={text} isWarning={isWarning} width={80} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('handles newlines in text', async () => {
    const text = 'Line 1\\nLine 2';
    const { lastFrame, waitUntilReady, unmount } = render(
      <Banner bannerText={text} isWarning={false} width={80} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
