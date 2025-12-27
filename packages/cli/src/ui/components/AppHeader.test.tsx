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

vi.mock('../utils/terminalSetup.js', () => ({
  getTerminalProgram: () => null,
}));

vi.mock('../../utils/persistentState.js', () => ({
  persistentState: {
    get: vi.fn().mockReturnValue({}),
    set: vi.fn(),
  },
}));

import { persistentState } from '../../utils/persistentState.js';

describe('<AppHeader />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      persistentState.get as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({});
  });

  it('should render the banner with default text', () => {
    const mockConfig = makeFakeConfig();
    const uiState = {
      banner: {
        bannerText: {
          title: 'This is the default banner',
          body: '',
        },
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
        bannerText: {
          title: '',
          body: '',
        },
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
        bannerText: {
          title: 'This is the default banner',
          body: '',
        },
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
        bannerText: {
          title: 'This is the default banner',
          body: '',
        },
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
        bannerText: {
          title: 'First line\\nSecond line',
          body: '',
        },
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

  it('should not render the banner if shown count exceeds limit', () => {
    (
      persistentState.get as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      [crypto.createHash('sha256').update('Standard Banner \n').digest('hex')]:
        5,
    });
    const mockConfig = makeFakeConfig();
    const uiState = {
      banner: {
        bannerText: {
          title: 'Standard Banner',
          body: '',
        },
        isWarning: false,
      },
      bannerVisible: true,
    };

    const { lastFrame, unmount } = renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig, uiState },
    );

    expect(lastFrame()).not.toContain('Standard Banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
