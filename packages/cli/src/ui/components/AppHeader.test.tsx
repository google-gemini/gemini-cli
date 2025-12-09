/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { AppHeader } from './AppHeader.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeConfig } from '@google/gemini-cli-core';

vi.mock('../utils/terminalSetup.js', () => ({
  getTerminalProgram: () => null,
}));

describe('<AppHeader />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the banner with default text', () => {
    const mockConfig = makeFakeConfig();
    const uiState = {
      banner: {
        bannerText: 'This is the default banner',
        isWarning: false,
      },
      bannerVisible: true,
    };

    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig, uiState },
    );

    expect(lastFrame()).toContain('This is the default banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should not render the banner when no flags are set', () => {
    const mockConfig = makeFakeConfig();
    const uiState = {
      banner: {
        bannerText: '',
        isWarning: false,
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
      banner: {
        bannerText: 'This is the default banner',
        isWarning: false,
      },
      bannerVisible: true,
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
      banner: {
        bannerText: 'This is the default banner',
        isWarning: false,
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

  it('should render banner text with unescaped newlines', () => {
    const mockConfig = makeFakeConfig();
    const uiState = {
      banner: {
        bannerText: 'First line\\nSecond line',
        isWarning: false,
      },
      bannerVisible: true,
    };

    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig, uiState },
    );

    expect(lastFrame()).not.toContain('First line\\nSecond line');
    unmount();
  });
});
