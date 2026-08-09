/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { InfoMessage } from './InfoMessage.js';
import { describe, it, expect } from 'vitest';

describe('InfoMessage', () => {
  it('renders with the correct default prefix and text', async () => {
    const { lastFrame, unmount } = await render(
      <InfoMessage text="Just so you know" />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders with a custom icon', async () => {
    const { lastFrame, unmount } = await render(
      <InfoMessage text="Custom icon test" icon="★" />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders multiline info messages', async () => {
    const message = 'Info line 1\nInfo line 2';
    const { lastFrame, unmount } = await render(<InfoMessage text={message} />);
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });
});
