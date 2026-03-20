/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { CliSpinner } from './CliSpinner.js';
import { debugState } from '../debug.js';
import { describe, it, expect, beforeEach } from 'vitest';

describe('<CliSpinner />', () => {
  beforeEach(() => {
    debugState.debugNumAnimatedComponents = 0;
  });

  it('should increment debugNumAnimatedComponents on mount and decrement on unmount', async () => {
    expect(debugState.debugNumAnimatedComponents).toBe(0);
    const { waitUntilReady, unmount } = renderWithProviders(<CliSpinner />);
    await waitUntilReady();
    expect(debugState.debugNumAnimatedComponents).toBe(1);
    unmount();
    expect(debugState.debugNumAnimatedComponents).toBe(0);
  });

  it('should not render when showSpinner is false', async () => {
    const settings = createMockSettings({ ui: { showSpinner: false } });
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <CliSpinner />,
      { settings },
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });
});
