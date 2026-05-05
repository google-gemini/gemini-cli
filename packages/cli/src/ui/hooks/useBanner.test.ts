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
import { useBanner, _clearSessionBannersForTest } from './useBanner.js';
import { persistentState } from '../../utils/persistentState.js';
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
    ui: {
      focus: 'mock-focus-color',
    },
  },
}));

vi.mock('../colors.js', () => ({
  Colors: {
    AccentBlue: 'mock-accent-blue',
  },
}));

describe('useBanner', () => {
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
    _clearSessionBannersForTest();

    // Default persistentState behavior: return empty object (no counts)
    mockedPersistentStateGet.mockReturnValue({});
  });

  it('should return warning text and warning color if warningText is present', async () => {
    const data = { defaultText: 'Standard', warningText: 'Critical Error' };

    const { result } = await renderHook(() => useBanner(data));

    expect(result.current.bannerText).toBe('Critical Error');
  });

  it('should hide banner if show count exceeds max limit (Legacy format)', async () => {
    mockedPersistentStateGet.mockReturnValue({
      [crypto
        .createHash('sha256')
        .update(defaultBannerData.defaultText)
        .digest('hex')]: 5,
    });

    const { result } = await renderHook(() => useBanner(defaultBannerData));

    expect(result.current.bannerText).toBe('');
  });

  it('should increment the persistent count when banner is shown', async () => {
    const data = { defaultText: 'Tracker', warningText: '' };

    // Current count is 1
    mockedPersistentStateGet.mockReturnValue({
      [crypto.createHash('sha256').update(data.defaultText).digest('hex')]: 1,
    });

    await renderHook(() => useBanner(data));

    // Expect set to be called with incremented count
    expect(mockedPersistentStateSet).toHaveBeenCalledWith(
      'defaultBannerShownCount',
      {
        [crypto.createHash('sha256').update(data.defaultText).digest('hex')]: 2,
      },
    );
  });

  it('should increment count if warning text is shown instead', async () => {
    const data = { defaultText: 'Standard', warningText: 'Warning' };

    await renderHook(() => useBanner(data));

    // Warning text now also gets counted
    expect(mockedPersistentStateSet).toHaveBeenCalledWith(
      'defaultBannerShownCount',
      {
        [crypto.createHash('sha256').update(data.warningText).digest('hex')]: 1,
      },
    );
  });

  it('should handle newline replacements', async () => {
    const data = { defaultText: 'Line1\\nLine2', warningText: '' };

    const { result } = await renderHook(() => useBanner(data));

    expect(result.current.bannerText).toBe('Line1\nLine2');
  });
});
