/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
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
  ])('renders correctly in $stateName', ({ mockState, expectedText }) => {
    mockedUsePrivacySettings.mockReturnValue({
      privacyState: { ...defaultState, ...mockState },
      updateDataCollectionOptIn,
    });

    const { lastFrame } = render(
      <CloudFreePrivacyNotice config={mockConfig} onExit={onExit} />,
    );

    expect(lastFrame()).toContain(expectedText);
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
    ({ mockState, shouldExit }) => {
      mockedUsePrivacySettings.mockReturnValue({
        privacyState: { ...defaultState, ...mockState },
        updateDataCollectionOptIn,
      });

      render(<CloudFreePrivacyNotice config={mockConfig} onExit={onExit} />);

      const keypressHandler = mockedUseKeypress.mock.calls[0][0];
      keypressHandler({ name: 'escape' });

      if (shouldExit) {
        expect(onExit).toHaveBeenCalled();
      } else {
        expect(onExit).not.toHaveBeenCalled();
      }
    },
  );

  describe('RadioButtonSelect interaction', () => {
    it.each([
      { selection: true, label: 'Yes' },
      { selection: false, label: 'No' },
    ])('calls correct functions on selecting "$label"', ({ selection }) => {
      render(<CloudFreePrivacyNotice config={mockConfig} onExit={onExit} />);

      const onSelectHandler = mockedRadioButtonSelect.mock.calls[0][0].onSelect;
      onSelectHandler(selection);

      expect(updateDataCollectionOptIn).toHaveBeenCalledWith(selection);
      expect(onExit).toHaveBeenCalled();
    });
  });
});
