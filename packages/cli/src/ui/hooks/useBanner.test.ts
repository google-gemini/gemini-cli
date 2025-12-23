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
import { persistentState } from '../../utils/persistentState.js';

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
  const mockedPersistentState = persistentState as unknown as {
    get: MockedFunction<typeof persistentState.get>;
    set: MockedFunction<typeof persistentState.set>;
  };

  const defaultBannerData = {
    bannerText: {
      title: 'Standard Banner',
      body: '',
    },
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

    expect(result.current.title).toBe('');
    expect(result.current.body).toBe('');
  });

  it('should increment banner shown count when banner is shown', () => {
    mockedPersistentState.get.mockReturnValue({});

    renderHook(() =>
      useBanner(defaultBannerData, mockConfig as unknown as Config),
    );

    expect(mockedPersistentState.get).toHaveBeenCalledWith(
      'defaultBannerShownCount',
    );
    expect(mockedPersistentState.set).toHaveBeenCalledWith(
      'defaultBannerShownCount',
      expect.objectContaining({
        // Hash for "Standard Banner"
        e1a84b6fb88e50f1a51826f94630ca087a6a6504b409948344fcb67f8569a72c: 1,
      }),
    );
  });

  it('should NOT show banner if it has been shown max times', () => {
    // 20 is the DEFAULT_MAX_BANNER_SHOWN_COUNT
    mockedPersistentState.get.mockReturnValue({
      e1a84b6fb88e50f1a51826f94630ca087a6a6504b409948344fcb67f8569a72c: 5,
    });

    const { result } = renderHook(() =>
      useBanner(defaultBannerData, mockConfig as unknown as Config),
    );

    expect(result.current.title).toBe('');
    expect(result.current.body).toBe('');
  });

  it('should show banner if it has been shown less than max times', () => {
    mockedPersistentState.get.mockReturnValue({
      e1a84b6fb88e50f1a51826f94630ca087a6a6504b409948344fcb67f8569a72c: 4,
    });

    const { result } = renderHook(() =>
      useBanner(defaultBannerData, mockConfig as unknown as Config),
    );

    expect(result.current.title).toBe('Standard Banner');
    expect(mockedPersistentState.set).toHaveBeenCalledWith(
      'defaultBannerShownCount',
      expect.objectContaining({
        e1a84b6fb88e50f1a51826f94630ca087a6a6504b409948344fcb67f8569a72c: 5,
      }),
    );
  });
});
