/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { AppHeader } from './AppHeader.js';
import { describe, it, expect } from 'vitest';
import { makeFakeConfig } from '@google/gemini-cli-core';

describe('<AppHeader />', () => {
  it('should render the banner with default text', () => {
    const mockConfig = makeFakeConfig();
    mockConfig.getExperiments = () => ({
      flags: {
        GeminiCLIBannerText__no_capacity_issues: {
          stringValue: 'This is the default banner',
        },
      },
      experimentIds: [],
    });

    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig },
    );

    expect(lastFrame()).toContain('This is the default banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render the banner with warning text', () => {
    const mockConfig = makeFakeConfig();
    mockConfig.getExperiments = () => ({
      flags: {
        GeminiCLIBannerText__no_capacity_issues: {
          stringValue: 'This is the default banner',
        },
        GeminiCLIBannerText__capacity_issues: {
          stringValue: 'There are capacity issues',
        },
      },
      experimentIds: [],
    });

    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig },
    );

    expect(lastFrame()).toContain('There are capacity issues');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should not render the banner when no flags are set', () => {
    const mockConfig = makeFakeConfig();
    mockConfig.getExperiments = () => ({
      flags: {},
      experimentIds: [],
    });

    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig },
    );

    expect(lastFrame()).not.toContain('Banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
