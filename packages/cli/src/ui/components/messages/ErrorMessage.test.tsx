/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { ErrorMessage } from './ErrorMessage.js';
import { describe, it, expect } from 'vitest';

describe('ErrorMessage', () => {
  it('renders with the correct prefix and text', () => {
    const { lastFrame } = render(<ErrorMessage text="Something went wrong" />);
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('renders multiline error messages', () => {
    const message = 'Error line 1\nError line 2';
    const { lastFrame } = render(<ErrorMessage text={message} />);
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });
});
