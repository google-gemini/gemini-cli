/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useBanner } from './useBanner.js';
import type { Config } from '@google/gemini-cli-core';

vi.mock('../../utils/persistentState.js', () => ({
  persistentState: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../semantic-colors.js', () => ({
  theme: {
    status: {
      warning: 'mock-warning-color',
    },
  },
}));

vi.mock('../colors.js', () => ({
  Colors: {
    AccentBlue: 'mock-accent-blue',
  },
}));

// Define the shape of the config methods used by this hook
interface MockConfigShape {
  getPreviewFeatures: MockedFunction<() => boolean>;
}

describe('useBanner', () => {
  let mockConfig: MockConfigShape;

  const defaultBannerData = {
    bannerText: 'Standard Banner',
    isWarning: false,
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // Initialize the mock config with default behavior
    mockConfig = {
      getPreviewFeatures: vi.fn().mockReturnValue(false),
    };
  });

  it('should NOT show default banner if preview features are enabled in config', () => {
    // Simulate Preview Features Enabled
    mockConfig.getPreviewFeatures.mockReturnValue(true);

    const { result } = renderHook(() =>
      useBanner(defaultBannerData, mockConfig as unknown as Config),
    );

    // Should fall back to warningText (which is empty)
    expect(result.current.bannerText).toBe('');
  });
});
