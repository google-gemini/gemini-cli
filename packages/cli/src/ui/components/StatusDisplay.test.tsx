/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '../../test-utils/render.js';
import { Text } from 'ink';
import { StatusDisplay } from './StatusDisplay.js';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { SettingsContext } from '../contexts/SettingsContext.js';
import type { Config } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import { createMockSettings } from '../../test-utils/settings.js';
import type { TextBuffer } from './shared/text-buffer.js';

// Mock child components to simplify testing
vi.mock('./ContextSummaryDisplay.js', () => ({
  ContextSummaryDisplay: (props: {
    skillCount: number;
    backgroundProcessCount: number;
  }) => (
    <Text>
      Mock Context Summary Display (Skills: {props.skillCount}, Shells:{' '}
      {props.backgroundProcessCount})
    </Text>
  ),
}));

vi.mock('./HookStatusDisplay.js', () => ({
  HookStatusDisplay: () => <Text>Mock Hook Status Display</Text>,
}));

// Use a type that allows partial buffer for mocking purposes
type UIStateOverrides = Partial<Omit<UIState, 'buffer'>> & {
  buffer?: Partial<TextBuffer>;
};

// Create mock context providers
const createMockUIState = (overrides: UIStateOverrides = {}): UIState =>
  ({
    ctrlCPressedOnce: false,
    transientMessage: null,
    ctrlDPressedOnce: false,
    showEscapePrompt: false,
    shortcutsHelpVisible: false,
    queueErrorMessage: null,
    activeHooks: [],
    ideContextState: null,
    geminiMdFileCount: 0,
    contextFileNames: [],
    backgroundShellCount: 0,
    buffer: { text: '' },
    history: [{ id: 1, type: 'user', text: 'test' }],
    ...overrides,
  }) as UIState;

const createMockConfig = (overrides = {}) => ({
  getMcpClientManager: vi.fn().mockImplementation(() => ({
    getBlockedMcpServers: vi.fn(() => []),
    getMcpServers: vi.fn(() => ({})),
  })),
  getSkillManager: vi.fn().mockImplementation(() => ({
    getSkills: vi.fn(() => ['skill1', 'skill2']),
    getDisplayableSkills: vi.fn(() => ['skill1', 'skill2']),
  })),
  ...overrides,
});

const renderStatusDisplay = async (
  props: { hideContextSummary: boolean } = { hideContextSummary: false },
  uiState: UIState = createMockUIState(),
  settings = createMockSettings(),
  config = createMockConfig(),
) => {
  const result = render(
    <ConfigContext.Provider value={config as unknown as Config}>
      <SettingsContext.Provider value={settings as unknown as LoadedSettings}>
        <UIStateContext.Provider value={uiState}>
          <StatusDisplay {...props} />
        </UIStateContext.Provider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>,
  );
  await result.waitUntilReady();
  return result;
};

describe('StatusDisplay', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env['GEMINI_SYSTEM_MD'];
    vi.restoreAllMocks();
  });

  it('renders nothing by default if context summary is hidden via props', async () => {
    const { lastFrame, unmount } = await renderStatusDisplay({
      hideContextSummary: true,
    });
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders ContextSummaryDisplay by default', async () => {
    const { lastFrame, unmount } = await renderStatusDisplay();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders system md indicator if env var is set', async () => {
    process.env['GEMINI_SYSTEM_MD'] = 'true';
    const { lastFrame, unmount } = await renderStatusDisplay();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders HookStatusDisplay when hooks are active', async () => {
    const uiState = createMockUIState({
      activeHooks: [{ name: 'hook', eventName: 'event' }],
    });
    const { lastFrame, unmount } = await renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('does NOT render HookStatusDisplay if notifications are disabled in settings', async () => {
    const uiState = createMockUIState({
      activeHooks: [{ name: 'hook', eventName: 'event' }],
    });
    const settings = createMockSettings({
      hooksConfig: { notifications: false },
    });
    const { lastFrame, unmount } = await renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
      settings,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('hides ContextSummaryDisplay if configured in settings', async () => {
    const settings = createMockSettings({
      ui: { hideContextSummary: true },
    });
    const { lastFrame, unmount } = await renderStatusDisplay(
      { hideContextSummary: false },
      undefined,
      settings,
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('passes backgroundShellCount to ContextSummaryDisplay', async () => {
    const uiState = createMockUIState({
      backgroundShellCount: 3,
    });
    const { lastFrame, unmount } = await renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toContain('Shells: 3');
    unmount();
  });
});
