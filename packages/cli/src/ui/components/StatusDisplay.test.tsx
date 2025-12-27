/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '../../test-utils/render.js';
import { Text } from 'ink';
import { StatusDisplay } from './StatusDisplay.js';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { SettingsContext } from '../contexts/SettingsContext.js';

// Mock child components to simplify testing
vi.mock('./ContextSummaryDisplay.js', () => ({
  ContextSummaryDisplay: () => <Text>ContextSummaryDisplay</Text>,
}));

vi.mock('./HookStatusDisplay.js', () => ({
  HookStatusDisplay: () => <Text>HookStatusDisplay</Text>,
}));

// Create mock context providers
const createMockUIState = (overrides: Partial<UIState> = {}): UIState =>
  ({
    ctrlCPressedOnce: false,
    warningMessage: null,
    ctrlDPressedOnce: false,
    showEscapePrompt: false,
    queueErrorMessage: null,
    activeHooks: [],
    ideContextState: null,
    geminiMdFileCount: 0,
    contextFileNames: [],
    ...overrides,
  }) as UIState;

const createMockConfig = (overrides = {}) => ({
  getMcpClientManager: vi.fn().mockImplementation(() => ({
    getBlockedMcpServers: vi.fn(() => []),
    getMcpServers: vi.fn(() => ({})),
  })),
  ...overrides,
});

const createMockSettings = (merged = {}) => ({
  merged: {
    hooks: { notifications: true },
    ui: { hideContextSummary: false },
    ...merged,
  },
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const renderStatusDisplay = (
  props: { hideContextSummary: boolean } = { hideContextSummary: false },
  uiState: UIState = createMockUIState(),
  settings = createMockSettings(),
  config = createMockConfig(),
) =>
  render(
    <ConfigContext.Provider value={config as any}>
      <SettingsContext.Provider value={settings as any}>
        <UIStateContext.Provider value={uiState}>
          <StatusDisplay {...props} />
        </UIStateContext.Provider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>,
  );
/* eslint-enable @typescript-eslint/no-explicit-any */

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
    expect(lastFrame()).toContain('ContextSummaryDisplay');
  });

  it('renders system md indicator if env var is set', () => {
    process.env['GEMINI_SYSTEM_MD'] = 'true';
    const { lastFrame } = renderStatusDisplay();
    expect(lastFrame()).toContain('|⌐■_■|');
  });

  it('prioritizes Ctrl+C prompt over everything else (except system md)', () => {
    const uiState = createMockUIState({
      ctrlCPressedOnce: true,
      warningMessage: 'Warning',
      activeHooks: [{ name: 'hook', eventName: 'event' }],
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toContain('Press Ctrl+C again to exit');
    expect(lastFrame()).not.toContain('Warning');
    expect(lastFrame()).not.toContain('HookStatusDisplay');
  });

  it('renders warning message', () => {
    const uiState = createMockUIState({
      warningMessage: 'This is a warning',
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toContain('This is a warning');
  });

  it('prioritizes warning over Ctrl+D', () => {
    const uiState = createMockUIState({
      warningMessage: 'Warning',
      ctrlDPressedOnce: true,
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toContain('Warning');
    expect(lastFrame()).not.toContain('Press Ctrl+D again to exit');
  });

  it('renders Ctrl+D prompt', () => {
    const uiState = createMockUIState({
      ctrlDPressedOnce: true,
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toContain('Press Ctrl+D again to exit');
  });

  it('renders Escape prompt', () => {
    const uiState = createMockUIState({
      showEscapePrompt: true,
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toContain('Press Esc again to clear');
  });

  it('renders Queue Error Message', () => {
    const uiState = createMockUIState({
      queueErrorMessage: 'Queue Error',
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toContain('Queue Error');
  });

  it('renders HookStatusDisplay when hooks are active', () => {
    const uiState = createMockUIState({
      activeHooks: [{ name: 'hook', eventName: 'event' }],
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
    );
    expect(lastFrame()).toContain('HookStatusDisplay');
  });

  it('does NOT render HookStatusDisplay if notifications are disabled in settings', () => {
    const uiState = createMockUIState({
      activeHooks: [{ name: 'hook', eventName: 'event' }],
    });
    const settings = createMockSettings({
      hooks: { notifications: false },
    });
    const { lastFrame } = renderStatusDisplay(
      { hideContextSummary: false },
      uiState,
      settings,
    );
    // Should fall back to ContextSummaryDisplay
    expect(lastFrame()).toContain('ContextSummaryDisplay');
    expect(lastFrame()).not.toContain('HookStatusDisplay');
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
});
