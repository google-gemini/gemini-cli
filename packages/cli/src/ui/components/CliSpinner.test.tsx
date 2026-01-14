/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  renderWithProviders,
  createMockSettings,
} from '../../test-utils/render.js';
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

  it('should not increment debugNumAnimatedComponents when disableSpinner is true', () => {
    const settings = createMockSettings({
      ui: {
        accessibility: {
          disableSpinner: true,
        },
      },
    });

    expect(debugState.debugNumAnimatedComponents).toBe(0);
    const { lastFrame, unmount } = renderWithProviders(<CliSpinner />, {
      settings,
    });
    expect(debugState.debugNumAnimatedComponents).toBe(0);
    expect(lastFrame()).toBe('');
    unmount();
    expect(debugState.debugNumAnimatedComponents).toBe(0);
  });
});
