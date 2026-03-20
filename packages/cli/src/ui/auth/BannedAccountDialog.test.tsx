/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { BannedAccountDialog } from './BannedAccountDialog.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  openBrowserSecurely,
  shouldLaunchBrowser,
} from '@google/gemini-cli-core';
import { Text } from 'ink';
import { runExitCleanup } from '../../utils/cleanup.js';
import type { AccountSuspensionInfo } from '../contexts/UIStateContext.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    openBrowserSecurely: vi.fn(),
    shouldLaunchBrowser: vi.fn().mockReturnValue(true),
  };
});

vi.mock('../../utils/cleanup.js', () => ({
  runExitCleanup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../components/shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(({ items }) => (
    <>
      {items.map((item: { value: string; label: string }) => (
        <Text key={item.value}>{item.label}</Text>
      ))}
    </>
  )),
}));

const mockedRadioButtonSelect = RadioButtonSelect as Mock;
const mockedUseKeypress = useKeypress as Mock;
const mockedOpenBrowser = openBrowserSecurely as Mock;
const mockedShouldLaunchBrowser = shouldLaunchBrowser as Mock;
const mockedRunExitCleanup = runExitCleanup as Mock;

const DEFAULT_SUSPENSION_INFO: AccountSuspensionInfo = {
  message:
    'This service has been disabled in this account for violation of Terms of Service. Please submit an appeal to continue using this product.',
  appealUrl: 'https://example.com/appeal',
  appealLinkText: 'Appeal Here',
};

describe('BannedAccountDialog', () => {
  let onExit: Mock;
  let onChangeAuth: Mock;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedShouldLaunchBrowser.mockReturnValue(true);
    mockedOpenBrowser.mockResolvedValue(undefined);
    mockedRunExitCleanup.mockResolvedValue(undefined);
    onExit = vi.fn();
    onChangeAuth = vi.fn();
  });

  it('renders the suspension message from accountSuspensionInfo', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <BannedAccountDialog
        accountSuspensionInfo={DEFAULT_SUSPENSION_INFO}
        onExit={onExit}
        onChangeAuth={onChangeAuth}
      />,
    );
    await waitUntilReady();
    const frame = lastFrame();
    expect(frame).toContain('Account Suspended');
    expect(frame).toContain('violation of Terms of Service');
    expect(frame).toContain('Escape to exit');
    unmount();
  });

  it('renders menu options with appeal link text from response', async () => {
    const { waitUntilReady, unmount } = renderWithProviders(
      <BannedAccountDialog
        accountSuspensionInfo={DEFAULT_SUSPENSION_INFO}
        onExit={onExit}
        onChangeAuth={onChangeAuth}
      />,
    );
    await waitUntilReady();
    const items = mockedRadioButtonSelect.mock.calls[0][0].items;
    expect(items).toHaveLength(3);
    expect(items[0].label).toBe('Appeal Here');
    expect(items[1].label).toBe('Change authentication');
    expect(items[2].label).toBe('Exit');
    unmount();
  });

  it('hides form option when no appealUrl is provided', async () => {
    const infoWithoutUrl: AccountSuspensionInfo = {
      message: 'Account suspended.',
    };
    const { waitUntilReady, unmount } = renderWithProviders(
      <BannedAccountDialog
        accountSuspensionInfo={infoWithoutUrl}
        onExit={onExit}
        onChangeAuth={onChangeAuth}
      />,
    );
    await waitUntilReady();
    const items = mockedRadioButtonSelect.mock.calls[0][0].items;
    expect(items).toHaveLength(2);
    expect(items[0].label).toBe('Change authentication');
    expect(items[1].label).toBe('Exit');
    unmount();
  });

  it('uses default label when appealLinkText is not provided', async () => {
    const infoWithoutLinkText: AccountSuspensionInfo = {
      message: 'Account suspended.',
      appealUrl: 'https://example.com/appeal',
    };
    const { waitUntilReady, unmount } = renderWithProviders(
      <BannedAccountDialog
        accountSuspensionInfo={infoWithoutLinkText}
        onExit={onExit}
        onChangeAuth={onChangeAuth}
      />,
    );
    await waitUntilReady();
    const items = mockedRadioButtonSelect.mock.calls[0][0].items;
    expect(items[0].label).toBe('Open the Google Form');
    unmount();
  });

  it('opens browser when appeal option is selected', async () => {
    const { waitUntilReady, unmount } = renderWithProviders(
      <BannedAccountDialog
        accountSuspensionInfo={DEFAULT_SUSPENSION_INFO}
        onExit={onExit}
        onChangeAuth={onChangeAuth}
      />,
    );
    await waitUntilReady();
    const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
    await onSelect('open_form');
    expect(mockedOpenBrowser).toHaveBeenCalledWith(
      'https://example.com/appeal',
    );
    expect(onExit).not.toHaveBeenCalled();
    unmount();
  });

  it('shows URL when browser cannot be launched', async () => {
    mockedShouldLaunchBrowser.mockReturnValue(false);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <BannedAccountDialog
        accountSuspensionInfo={DEFAULT_SUSPENSION_INFO}
        onExit={onExit}
        onChangeAuth={onChangeAuth}
      />,
    );
    await waitUntilReady();
    const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
    onSelect('open_form');
    await waitFor(() => {
      expect(lastFrame()).toContain('Please open this URL in a browser');
    });
    expect(mockedOpenBrowser).not.toHaveBeenCalled();
    unmount();
  });

  it('calls onExit when "Exit" is selected', async () => {
    const { waitUntilReady, unmount } = renderWithProviders(
      <BannedAccountDialog
        accountSuspensionInfo={DEFAULT_SUSPENSION_INFO}
        onExit={onExit}
        onChangeAuth={onChangeAuth}
      />,
    );
    await waitUntilReady();
    const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
    await onSelect('exit');
    expect(mockedRunExitCleanup).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
    unmount();
  });

  it('calls onChangeAuth when "Change authentication" is selected', async () => {
    const { waitUntilReady, unmount } = renderWithProviders(
      <BannedAccountDialog
        accountSuspensionInfo={DEFAULT_SUSPENSION_INFO}
        onExit={onExit}
        onChangeAuth={onChangeAuth}
      />,
    );
    await waitUntilReady();
    const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
    onSelect('change_auth');
    expect(onChangeAuth).toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    unmount();
  });

  it('exits on escape key', async () => {
    const { waitUntilReady, unmount } = renderWithProviders(
      <BannedAccountDialog
        accountSuspensionInfo={DEFAULT_SUSPENSION_INFO}
        onExit={onExit}
        onChangeAuth={onChangeAuth}
      />,
    );
    await waitUntilReady();
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];
    const result = keypressHandler({ name: 'escape' });
    expect(result).toBe(true);
    unmount();
  });

  it('renders snapshot correctly', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <BannedAccountDialog
        accountSuspensionInfo={DEFAULT_SUSPENSION_INFO}
        onExit={onExit}
        onChangeAuth={onChangeAuth}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
