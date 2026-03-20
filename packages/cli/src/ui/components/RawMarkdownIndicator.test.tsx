/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { RawMarkdownIndicator } from './RawMarkdownIndicator.js';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

describe('RawMarkdownIndicator', () => {
  const originalPlatform = process.platform;

  beforeEach(() => vi.stubEnv('FORCE_GENERIC_KEYBINDING_HINTS', ''));

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    vi.unstubAllEnvs();
  });

  it('renders correct key binding for darwin', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    const { lastFrame, unmount } = await render(<RawMarkdownIndicator />);
    expect(lastFrame()).toContain('raw markdown mode');
    expect(lastFrame()).toContain('Option+M to toggle');
    unmount();
  });

  it('renders correct key binding for other platforms', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });
    const { lastFrame, unmount } = await render(<RawMarkdownIndicator />);
    expect(lastFrame()).toContain('raw markdown mode');
    expect(lastFrame()).toContain('Alt+M to toggle');
    unmount();
  });
});
