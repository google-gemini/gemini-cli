/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  renderWithProviders,
  persistentStateMock,
} from '../../test-utils/render.js';
import type { LoadedSettings } from '../../config/settings.js';
import { AppHeader } from './AppHeader.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeConfig } from '@google/gemini-cli-core';
import crypto from 'node:crypto';
import { _clearSessionBannersForTest } from '../hooks/useBanner.js';

vi.mock('../utils/terminalSetup.js', () => ({
  getTerminalProgram: () => null,
}));

describe('<AppHeader />', () => {
  beforeEach(() => {
    _clearSessionBannersForTest();
    // Clean CAMP env vars so tests don't bleed into each other
    delete process.env['CAMP_VERSION'];
    delete process.env['CAMP_AGENT_NAME'];
    delete process.env['CAMP_AGENT_CODE'];
    delete process.env['CAMP_SC2_STATUS'];
    delete process.env['CAMP_INFRA_STATUS'];
  });

  it('should render the banner with default text', async () => {
    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: '',
      },
      bannerVisible: true,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        uiState,
      },
    );

    expect(lastFrame()).toContain('This is the default banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render the banner with warning text', async () => {
    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: 'There are capacity issues',
      },
      bannerVisible: true,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        uiState,
      },
    );

    expect(lastFrame()).toContain('There are capacity issues');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should not render the banner when no flags are set', async () => {
    const uiState = {
      history: [],
      bannerData: {
        defaultText: '',
        warningText: '',
      },
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        uiState,
      },
    );

    expect(lastFrame()).not.toContain('Banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should not render the default banner if shown count is 5 or more', async () => {
    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: '',
      },
    };

    persistentStateMock.setData({
      defaultBannerShownCount: {
        [crypto
          .createHash('sha256')
          .update(uiState.bannerData.defaultText)
          .digest('hex')]: 5,
      },
    });

    const { lastFrame, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        uiState,
      },
    );

    expect(lastFrame()).not.toContain('This is the default banner');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should increment the version count when default banner is displayed', async () => {
    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'This is the default banner',
        warningText: '',
      },
    };

    // Set tipsShown to 10 or more to prevent Tips from incrementing its count
    // and interfering with the expected persistentState.set call.
    persistentStateMock.setData({ tipsShown: 10 });

    const { unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        uiState,
      },
    );

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

  it('should render banner text with unescaped newlines', async () => {
    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'First line\\nSecond line',
        warningText: '',
      },
      bannerVisible: true,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        uiState,
      },
    );

    expect(lastFrame()).not.toContain('First line\\nSecond line');
    unmount();
  });

  it('should render Tips when tipsShown is less than 10', async () => {
    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'First line\\nSecond line',
        warningText: '',
      },
      bannerVisible: true,
    };

    persistentStateMock.setData({ tipsShown: 5 });

    const { lastFrame, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        uiState,
      },
    );

    expect(lastFrame()).toContain('Tips');
    expect(persistentStateMock.set).toHaveBeenCalledWith('tipsShown', 6);
    unmount();
  });

  it('should NOT render Tips when tipsShown is 10 or more', async () => {
    const uiState = {
      bannerData: {
        defaultText: '',
        warningText: '',
      },
    };

    persistentStateMock.setData({ tipsShown: 10 });

    const { lastFrame, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        uiState,
      },
    );

    expect(lastFrame()).not.toContain('Tips');
    unmount();
  });

  it('should show tips until they have been shown 10 times (persistence flow)', async () => {
    persistentStateMock.setData({ tipsShown: 9 });

    const uiState = {
      history: [],
      bannerData: {
        defaultText: 'First line\\nSecond line',
        warningText: '',
      },
      bannerVisible: true,
    };

    // First session
    const session1 = await renderWithProviders(<AppHeader version="1.0.0" />, {
      uiState,
    });

    expect(session1.lastFrame()).toContain('Tips');
    expect(persistentStateMock.get('tipsShown')).toBe(10);
    session1.unmount();

    // Second session - state is persisted in the fake
    const session2 = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {},
    );

    expect(session2.lastFrame()).not.toContain('Tips');
    session2.unmount();
  });

  it('should render the full logo when logged out', async () => {
    const mockConfig = makeFakeConfig();
    vi.spyOn(mockConfig, 'getContentGeneratorConfig').mockReturnValue({
      authType: undefined,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        config: mockConfig,
        uiState: {
          terminalWidth: 120,
        },
      },
    );
    await waitUntilReady();

    // Check for block characters from the logo
    expect(lastFrame()).toContain('▗█▀▀▜▙');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should NOT render Tips when ui.hideTips is true', async () => {
    const mockConfig = makeFakeConfig();
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        config: mockConfig,
        settings: {
          merged: {
            ui: { hideTips: true },
          },
        } as unknown as LoadedSettings,
      },
    );
    await waitUntilReady();

    expect(lastFrame()).not.toContain('Tips');
    unmount();
  });

  it('should render the CAMP identity line when CAMP_VERSION is set', async () => {
    process.env['CAMP_VERSION'] = '3.9.4';
    process.env['CAMP_AGENT_NAME'] = 'RickXy';
    process.env['CAMP_AGENT_CODE'] = 'GEM';

    const mockConfig = makeFakeConfig();
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('CAMP v3.9.4');
    expect(lastFrame()).toContain('@RickXy');
    unmount();
  });

  it('should NOT render the CAMP identity line when CAMP_VERSION is absent', async () => {
    const mockConfig = makeFakeConfig();
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig },
    );
    await waitUntilReady();

    expect(lastFrame()).not.toContain('CAMP v');
    unmount();
  });

  it('should show SC2 warning in CAMP line when CAMP_SC2_STATUS is WARN', async () => {
    process.env['CAMP_VERSION'] = '3.9.4';
    process.env['CAMP_SC2_STATUS'] = 'WARN';

    const mockConfig = makeFakeConfig();
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      { config: mockConfig },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('SC2');
    unmount();
  });
});
