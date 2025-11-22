/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { RawMarkdownIndicator } from './RawMarkdownIndicator.js';
import { describe, it, expect, afterEach } from 'vitest';

describe('RawMarkdownIndicator', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  it('renders correct key binding for darwin', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    const { lastFrame } = render(<RawMarkdownIndicator />);
    expect(lastFrame()).toContain('raw markdown mode');
    expect(lastFrame()).toContain('option+m to toggle');
  });

  it('renders correct key binding for other platforms', () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });
    const { lastFrame } = render(<RawMarkdownIndicator />);
    expect(lastFrame()).toContain('raw markdown mode');
    expect(lastFrame()).toContain('alt+m to toggle');
  });
});
