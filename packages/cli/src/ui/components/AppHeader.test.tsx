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
    const uiState = {
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: '',
      },
    };

    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig, uiState },
    );

    expect(lastFrame()).toContain('This is the default banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render the banner with warning text', () => {
    const mockConfig = makeFakeConfig();
    const uiState = {
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: 'There are capacity issues',
      },
    };

    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig, uiState },
    );

    expect(lastFrame()).toContain('There are capacity issues');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should not render the banner when no flags are set', () => {
    const mockConfig = makeFakeConfig();
    const uiState = {
      bannerData: {
        defaultText: '',
        warningText: '',
      },
    };

    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig, uiState },
    );

    expect(lastFrame()).not.toContain('Banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render the banner when previewFeatures is disabled', () => {
    const mockConfig = makeFakeConfig({ previewFeatures: false });
    const uiState = {
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: '',
      },
    };

    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig, uiState },
    );

    expect(lastFrame()).toContain('This is the default banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should not render the banner when previewFeatures is enabled', () => {
    const mockConfig = makeFakeConfig({ previewFeatures: true });
    const uiState = {
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: '',
      },
    };

    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig, uiState },
    );

    expect(lastFrame()).not.toContain('This is the default banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
