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
import { TransientMessageType } from '../../utils/events.js';
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

const renderStatusDisplay = (
  props: { hideContextSummary: boolean } = { hideContextSummary: false },
  uiState: UIState = createMockUIState(),
  settings = createMockSettings(),
  config = createMockConfig(),
) =>
  render(
    <ConfigContext.Provider value={config as unknown as Config}>
      <SettingsContext.Provider value={settings as unknown as LoadedSettings}>
        <UIStateContext.Provider value={uiState}>
          <StatusDisplay {...props} />
        </UIStateContext.Provider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>,
  );

describe('StatusDisplay', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env['GEMINI_SYSTEM_MD'];
  });

  it('renders nothing by default if context summary is hidden via props', () => {
    const { lastFrame } = renderStatusDisplay({ hideContextSummary: true });
    expect(lastFrame()).toBe('');
  });

  it('renders ContextSummaryDisplay by default', () => {
    const { lastFrame } = renderStatusDisplay();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders system md indicator if env var is set', () => {
    process.env['GEMINI_SYSTEM_MD'] = 'true';
    const { lastFrame } = renderStatusDisplay();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('prioritizes Ctrl+C prompt over everything else (except system md)', () => {
    const uiState = createMockUIState({
      ctrlCPressedOnce: true,
      transientMessage: {
        text: 'Warning',
        type: TransientMessageType.Warning,
      },
      activeHooks: [{ name: 'hook', eventName: 'event' }],
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders warning message', () => {
    const uiState = createMockUIState({
      transientMessage: {
        text: 'This is a warning',
        type: TransientMessageType.Warning,
      },
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders hint message', () => {
    const uiState = createMockUIState({
      transientMessage: {
        text: 'This is a hint',
        type: TransientMessageType.Hint,
      },
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('prioritizes warning over Ctrl+D', () => {
    const uiState = createMockUIState({
      transientMessage: {
        text: 'Warning',
        type: TransientMessageType.Warning,
      },
      ctrlDPressedOnce: true,
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Ctrl+D prompt', () => {
    const uiState = createMockUIState({
      ctrlDPressedOnce: true,
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Escape prompt when buffer is empty', () => {
    const uiState = createMockUIState({
      showEscapePrompt: true,
      buffer: { text: '' },
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Escape prompt when buffer is NOT empty', () => {
    const uiState = createMockUIState({
      showEscapePrompt: true,
      buffer: { text: 'some text' },
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders Queue Error Message', () => {
    const uiState = createMockUIState({
      queueErrorMessage: 'Queue Error',
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders HookStatusDisplay when hooks are active', () => {
    const uiState = createMockUIState({
      activeHooks: [{ name: 'hook', eventName: 'event' }],
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('does NOT render HookStatusDisplay if notifications are disabled in settings', () => {
    const uiState = createMockUIState({
      activeHooks: [{ name: 'hook', eventName: 'event' }],
    });
    const settings = createMockSettings({
      hooksConfig: { notifications: false },
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
      settings,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('hides ContextSummaryDisplay if configured in settings', () => {
    const settings = createMockSettings({
      ui: { hideContextSummary: true },
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      undefined,
      settings,
    );
    expect(lastFrame()).toBe('');
  });

  it('passes backgroundShellCount to ContextSummaryDisplay', () => {
    const uiState = createMockUIState({
      backgroundShellCount: 3,
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toContain('Shells: 3');
  });
});
