/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  renderWithProviders,
  persistentStateMock,
} from '../../test-utils/render.js';
import { AppHeader } from './AppHeader.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeConfig } from '@google/gemini-cli-core';
import crypto from 'node:crypto';

vi.mock('../utils/terminalSetup.js', () => ({
  getTerminalProgram: () => null,
}));

describe('<AppHeader />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistentStateMock.get.mockRestore();
    persistentStateMock.set.mockRestore();
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
      {
        config: mockConfig,
        uiState,
        persistentState: {
          get: (key) => {
            if (key === 'tipsShown') return 0;
            if (key === 'defaultBannerShownCount') return {};
            return undefined;
          },
        },
      },
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
      {
        config: mockConfig,
        uiState,
        persistentState: {
          get: (key) => {
            if (key === 'tipsShown') return 0;
            if (key === 'defaultBannerShownCount') return {};
            return undefined;
          },
        },
      },
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
      {
        config: mockConfig,
        uiState,
        persistentState: {
          get: (key) => {
            if (key === 'tipsShown') return 0;
            if (key === 'defaultBannerShownCount') return {};
            return undefined;
          },
        },
      },
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
      {
        config: mockConfig,
        uiState,
        persistentState: {
          get: (key) => {
            if (key === 'tipsShown') return 0;
            if (key === 'defaultBannerShownCount') return {};
            return undefined;
          },
        },
      },
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
      {
        config: mockConfig,
        uiState,
        persistentState: {
          get: (key) => {
            if (key === 'tipsShown') return 0;
            if (key === 'defaultBannerShownCount') return {};
            return undefined;
          },
        },
      },
    );

    expect(lastFrame()).not.toContain('This is the default banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should not render the default banner if shown count is 5 or more', () => {
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
      {
        config: mockConfig,
        uiState,
        persistentState: {
          get: (key) => {
            if (key === 'tipsShown') return 0;
            if (key === 'defaultBannerShownCount') return {};
            if (key === 'defaultBannerShownCount') return 5;
            return undefined;
          },
        },
      },
    );

    expect(lastFrame()).not.toContain('This is the default banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should increment the version count when default banner is displayed', () => {
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
      persistentState: {
        get: (key) => {
          if (key === 'tipsShown') return 0;
          if (key === 'defaultBannerShownCount') return {};
          return undefined;
        },
      },
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
      {
        config: mockConfig,
        uiState,
        persistentState: {
          get: (key) => {
            if (key === 'tipsShown') return 0;
            if (key === 'defaultBannerShownCount') return {};
            return undefined;
          },
        },
      },
    );

    expect(lastFrame()).not.toContain('First line\\nSecond line');
    unmount();
  });

  it('should render Tips when tipsShown is less than 10', () => {
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
      {
        config: mockConfig,
        uiState,
        persistentState: {
          get: (key) => {
            if (key === 'tipsShown') return 5;
            return undefined;
          },
        },
      },
    );

    expect(lastFrame()).toContain('Tips');
    expect(persistentStateMock.set).toHaveBeenCalledWith('tipsShown', 6);
    unmount();
  });

  it('should NOT render Tips when tipsShown is 10 or more', () => {
    const mockConfig = makeFakeConfig();
    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        config: mockConfig,
        persistentState: {
          get: (key) => {
            if (key === 'tipsShown') return 10;
            return undefined;
          },
        },
      },
    );

    expect(lastFrame()).not.toContain('Tips');
    unmount();
  });

  it('should show tips until they have been shown 10 times (persistence flow)', () => {
    const fakeStore: Record<string, number> = {
      tipsShown: 9,
    };

    const mockConfig = makeFakeConfig();
    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'First line\\nSecond line',
        warningText: '',
      },
      bannerVisible: true,
    };
    const session1 = renderWithProviders(<AppHeader version="1.0.0" />, {
      config: mockConfig,
      uiState,
      persistentState: {
        get: (key) => fakeStore[key],
        set: (key, val) => {
          fakeStore[key] = val;
        },
      },
    });

    expect(session1.lastFrame()).toContain('Tips');
    expect(fakeStore['tipsShown']).toBe(10);
    session1.unmount();

    const session2 = renderWithProviders(<AppHeader version="1.0.0" />, {
      config: mockConfig,
      persistentState: {
        get: (key) => fakeStore[key],
        set: (key, val) => {
          fakeStore[key] = val;
        },
      },
    });

    expect(session2.lastFrame()).not.toContain('Tips');
    session2.unmount();
  });
});
