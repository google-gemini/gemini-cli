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

  it('should increment debugNumAnimatedComponents on mount and decrement on unmount', () => {
    expect(debugState.debugNumAnimatedComponents).toBe(0);
    const { unmount } = renderWithProviders(<CliSpinner />);
    expect(debugState.debugNumAnimatedComponents).toBe(1);
    unmount();
    expect(debugState.debugNumAnimatedComponents).toBe(0);
  });

  it('should not render when showSpinner is false', () => {
    const settings = createMockSettings({ ui: { showSpinner: false } });
    const { lastFrame } = renderWithProviders(<CliSpinner />, { settings });
    expect(lastFrame()).toBe('');
  });
});
