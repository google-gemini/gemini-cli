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
import { persistentState } from '../../utils/persistentState.js';
import type { Config } from '@google/gemini-cli-core';
import crypto from 'node:crypto';

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
  const mockedPersistentStateGet = persistentState.get as MockedFunction<
    typeof persistentState.get
  >;
  const mockedPersistentStateSet = persistentState.set as MockedFunction<
    typeof persistentState.set
  >;

  const defaultBannerData = {
    defaultText: 'Standard Banner',
    warningText: '',
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // Initialize the mock config with default behavior
    mockConfig = {
      getPreviewFeatures: vi.fn().mockReturnValue(false),
    };

    // Default persistentState behavior: return empty object (no counts)
    mockedPersistentStateGet.mockReturnValue({});
  });

  it('should return warning text and warning color if warningText is present', () => {
    const data = { defaultText: 'Standard', warningText: 'Critical Error' };

    const { result } = renderHook(() =>
      useBanner(data, mockConfig as unknown as Config),
    );

    expect(result.current.bannerText).toBe('Critical Error');
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

  it('should hide banner if show count exceeds max limit (Legacy format)', () => {
    mockedPersistentStateGet.mockReturnValue({
      [crypto
        .createHash('sha256')
        .update(defaultBannerData.defaultText)
        .digest('hex')]: 5,
    });

    const { result } = renderHook(() =>
      useBanner(defaultBannerData, mockConfig as unknown as Config),
    );

    expect(result.current.bannerText).toBe('');
  });

  it('should increment the persistent count when banner is shown', () => {
    const data = { defaultText: 'Tracker', warningText: '' };

    // Current count is 1
    mockedPersistentStateGet.mockReturnValue({
      [crypto.createHash('sha256').update(data.defaultText).digest('hex')]: 1,
    });

    renderHook(() => useBanner(data, mockConfig as unknown as Config));

    // Expect set to be called with incremented count
    expect(mockedPersistentStateSet).toHaveBeenCalledWith(
      'defaultBannerShownCount',
      {
        [crypto.createHash('sha256').update(data.defaultText).digest('hex')]: 2,
      },
    );
  });

  it('should NOT increment count if warning text is shown instead', () => {
    const data = { defaultText: 'Standard', warningText: 'Warning' };

    renderHook(() => useBanner(data, mockConfig as unknown as Config));

    // Since warning text takes precedence, default banner logic (and increment) is skipped
    expect(mockedPersistentStateSet).not.toHaveBeenCalled();
  });

  it('should handle newline replacements', () => {
    const data = { defaultText: 'Line1\\nLine2', warningText: '' };

    const { result } = renderHook(() =>
      useBanner(data, mockConfig as unknown as Config),
    );

    expect(result.current.bannerText).toBe('Line1\nLine2');
  });
});
