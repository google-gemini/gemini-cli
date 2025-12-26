/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { AppHeader } from './AppHeader.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeConfig } from '@google/gemini-cli-core';
import crypto from 'node:crypto';

const persistentStateMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../../utils/persistentState.js', () => ({
  persistentState: persistentStateMock,
}));

vi.mock('../utils/terminalSetup.js', () => ({
  getTerminalProgram: () => null,
}));

describe('<AppHeader />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistentStateMock.get.mockReturnValue({});
  });

  it('should render the banner with default text', () => {
    const mockConfig = makeFakeConfig();
    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: '',
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

  it('should render the banner with warning text', () => {
    const mockConfig = makeFakeConfig();
    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: 'There are capacity issues',
      },
      bannerVisible: true,
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
      history: [],
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
      history: [],
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: '',
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
      history: [],
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

  it('should not render the default banner if shown count is 5 or more', () => {
    persistentStateMock.get.mockReturnValue(5);
    const mockConfig = makeFakeConfig();
    const uiState = {
      history: [],
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

  it('should increment the version count when default banner is displayed', () => {
    persistentStateMock.get.mockReturnValue({});
    const mockConfig = makeFakeConfig();
    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: '',
      },
    };

    const { unmount } = renderWithProviders(<AppHeader version="1.0.0" />, {
      config: mockConfig,
      uiState,
    });

    expect(persistentStateMock.set).toHaveBeenCalledWith(
      'defaultBannerShownCount',
      {
        [crypto
          .createHash('sha256')
          .update(uiState.bannerData.defaultText)
          .digest('hex')]: 1,
      },
    );
    unmount();
  });

  it('should render banner text with unescaped newlines', () => {
    const mockConfig = makeFakeConfig();
    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'First line\\nSecond line',
        warningText: '',
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
