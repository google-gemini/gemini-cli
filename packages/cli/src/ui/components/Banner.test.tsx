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
    ['warning mode', true, 'Warning Title', 'Warning Body'],
    ['info mode', false, 'Info Title', 'Info Body'],
  ])('renders in %s', (_, isWarning, title, body) => {
    const { lastFrame } = render(
      <Banner title={title} body={body} isWarning={isWarning} width={80} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles newlines in text', () => {
    const title = 'Line 1';
    const body = 'Line 2\\nLine 3';
    const { lastFrame } = render(
      <Banner title={title} body={body} isWarning={false} width={80} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
