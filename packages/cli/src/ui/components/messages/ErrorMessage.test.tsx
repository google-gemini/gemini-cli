/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { ErrorMessage } from './ErrorMessage.js';
import { describe, it, expect } from 'vitest';

describe('ErrorMessage', () => {
  it('renders with the correct prefix and text', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ErrorMessage text="Something went wrong" />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders multiline error messages', async () => {
    const message = 'Error line 1\nError line 2';
    const { lastFrame, waitUntilReady, unmount } = render(
      <ErrorMessage text={message} />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });
});
