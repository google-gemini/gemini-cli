/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { WhoamiBox } from './WhoamiBox.js';
import { describe, it, expect } from 'vitest';

describe('WhoamiBox', () => {
  const defaultProps = {
    selectedAuthType: 'oauth',
  };

  it('renders with required props', () => {
    const { lastFrame } = render(<WhoamiBox {...defaultProps} />);
    const output = lastFrame();
    expect(output).toContain('Current Identity');
    expect(output).toContain('OAuth');
  });

  it('renders userEmail when provided', () => {
    const props = { ...defaultProps, userEmail: 'test@example.com' };
    const { lastFrame } = render(<WhoamiBox {...props} />);
    const output = lastFrame();
    expect(output).toContain('User Email');
    expect(output).toContain('test@example.com');
  });

  it('renders Auth Method correctly when not oauth', () => {
    const props = { selectedAuthType: 'api-key' };
    const { lastFrame } = render(<WhoamiBox {...props} />);
    const output = lastFrame();
    expect(output).toContain('api-key');
  });
});
