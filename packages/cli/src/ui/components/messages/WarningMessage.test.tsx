/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { WarningMessage } from './WarningMessage.js';
import { describe, it, expect } from 'vitest';

describe('WarningMessage', () => {
  it('renders with the correct prefix and text', () => {
    const { lastFrame } = render(<WarningMessage text="Watch out!" />);
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('renders multiline warning messages', () => {
    const message = 'Warning line 1\nWarning line 2';
    const { lastFrame } = render(<WarningMessage text={message} />);
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });
});
