/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act } from 'react';
import { CloudFreePrivacyNotice } from './CloudFreePrivacyNotice.js';
import { usePrivacySettings } from '../hooks/usePrivacySettings.js';
import { useKeypress } from '../hooks/useKeypress.js';
import type { Config } from '@google/gemini-cli-core';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';

// Mocks
vi.mock('../hooks/usePrivacySettings.js', () => ({
  usePrivacySettings: vi.fn(),
}));

vi.mock('../components/shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(),
}));

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

const mockedUsePrivacySettings = usePrivacySettings as Mock;
const mockedUseKeypress = useKeypress as Mock;
const mockedRadioButtonSelect = RadioButtonSelect as Mock;

describe('CloudFreePrivacyNotice', () => {
  const mockConfig = {} as Config;
  const onExit = vi.fn();
  const updateDataCollectionOptIn = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockedUsePrivacySettings.mockReturnValue({
      privacyState: {
        isLoading: false,
        error: undefined,
        isFreeTier: true,
        dataCollectionOptIn: undefined,
      },
      updateDataCollectionOptIn,
    });
  });

  const defaultState = {
    isLoading: false,
    error: undefined,
    isFreeTier: true,
    dataCollectionOptIn: undefined,
  };

  it.each([
    {
      stateName: 'loading state',
      mockState: { isLoading: true },
      expectedText: 'Loading...',
    },
    {
      stateName: 'error state',
      mockState: { error: 'Something went wrong' },
      expectedText: 'Error loading Opt-in settings',
    },
    {
      stateName: 'non-free tier state',
      mockState: { isFreeTier: false },
      expectedText: 'Gemini Code Assist Privacy Notice',
    },
    {
      stateName: 'free tier state',
      mockState: { isFreeTier: true },
      expectedText: 'Gemini Code Assist for Individuals Privacy Notice',
    },
  ])('renders correctly in $stateName', async ({ mockState, expectedText }) => {
    mockedUsePrivacySettings.mockReturnValue({
      privacyState: { ...defaultState, ...mockState },
      updateDataCollectionOptIn,
    });

    const { lastFrame, waitUntilReady, unmount } = render(
      <CloudFreePrivacyNotice config={mockConfig} onExit={onExit} />,
    );
    await waitUntilReady();

    expect(lastFrame()).toContain(expectedText);
    unmount();
  });

  it.each([
    {
      stateName: 'error state',
      mockState: { error: 'Something went wrong' },
      shouldExit: true,
    },
    {
      stateName: 'non-free tier state',
      mockState: { isFreeTier: false },
      shouldExit: true,
    },
    {
      stateName: 'free tier state (no selection)',
      mockState: { isFreeTier: true },
      shouldExit: false,
    },
  ])(
    'exits on Escape in $stateName: $shouldExit',
    async ({ mockState, shouldExit }) => {
      mockedUsePrivacySettings.mockReturnValue({
        privacyState: { ...defaultState, ...mockState },
        updateDataCollectionOptIn,
      });

      const { waitUntilReady, unmount } = render(
        <CloudFreePrivacyNotice config={mockConfig} onExit={onExit} />,
      );
      await waitUntilReady();

      const keypressHandler = mockedUseKeypress.mock.calls[0][0];
      await act(async () => {
        keypressHandler({ name: 'escape' });
      });
      // Escape key has a 50ms timeout in KeypressContext, so we need to wrap waitUntilReady in act
      await act(async () => {
        await waitUntilReady();
      });

      if (shouldExit) {
        expect(onExit).toHaveBeenCalled();
      } else {
        expect(onExit).not.toHaveBeenCalled();
      }
      unmount();
    },
  );

  describe('RadioButtonSelect interaction', () => {
    it.each([
      { selection: true, label: 'Yes' },
      { selection: false, label: 'No' },
    ])(
      'calls correct functions on selecting "$label"',
      async ({ selection }) => {
        const { waitUntilReady, unmount } = render(
          <CloudFreePrivacyNotice config={mockConfig} onExit={onExit} />,
        );
        await waitUntilReady();

        const onSelectHandler =
          mockedRadioButtonSelect.mock.calls[0][0].onSelect;
        await act(async () => {
          onSelectHandler(selection);
        });
        await waitUntilReady();

        expect(updateDataCollectionOptIn).toHaveBeenCalledWith(selection);
        expect(onExit).toHaveBeenCalled();
        unmount();
      },
    );
  });
});
