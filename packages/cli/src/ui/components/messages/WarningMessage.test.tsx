/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { WarningMessage } from './WarningMessage.js';
import { describe, it, expect } from 'vitest';

describe('WarningMessage', () => {
  it('renders with the correct prefix and text', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <WarningMessage text="Watch out!" />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders multiline warning messages', async () => {
    const message = 'Warning line 1\nWarning line 2';
    const { lastFrame, waitUntilReady, unmount } = render(
      <WarningMessage text={message} />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });
});
