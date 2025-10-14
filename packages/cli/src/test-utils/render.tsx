/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import type React from 'react';
import { LoadedSettings, type Settings } from '../config/settings.js';
import { KeypressProvider } from '../ui/contexts/KeypressContext.js';
import { SettingsContext } from '../ui/contexts/SettingsContext.js';
import { ShellFocusContext } from '../ui/contexts/ShellFocusContext.js';
import { UIStateContext, type UIState } from '../ui/contexts/UIStateContext.js';
import { ConfigContext } from '../ui/contexts/ConfigContext.js';
import { calculateMainAreaWidth } from '../ui/utils/ui-sizing.js';
import { VimModeProvider } from '../ui/contexts/VimModeContext.js';
import type { SessionStatsState } from '../ui/contexts/SessionContext.js';
import type { TextBufferState } from '../ui/components/shared/text-buffer.js';
import type { KittyProtocolStatus } from '../ui/hooks/useKittyKeyboardProtocol.js';

import { type Config } from '@google/gemini-cli-core';

const mockConfig = {
  getModel: () => 'gemini-pro',
  getTargetDir: () =>
    '/Users/test/project/foo/bar/and/some/more/directories/to/make/it/long',
  getDebugMode: () => false,
};

const configProxy = new Proxy(mockConfig, {
  get(target, prop) {
    if (prop in target) {
      return target[prop as keyof typeof target];
    }
    throw new Error(`mockConfig does not have property ${String(prop)}`);
  },
});

export const mockSettings = new LoadedSettings(
  { path: '', settings: {}, originalSettings: {} },
  { path: '', settings: {}, originalSettings: {} },
  { path: '', settings: {}, originalSettings: {} },
  { path: '', settings: {}, originalSettings: {} },
  true,
  new Set(),
);

export const createMockSettings = (
  overrides: Partial<Settings>,
): LoadedSettings => {
  const settings = overrides as Settings;
  return new LoadedSettings(
    { path: '', settings: {}, originalSettings: {} },
    { path: '', settings: {}, originalSettings: {} },
    { path: '', settings, originalSettings: settings },
    { path: '', settings: {}, originalSettings: {} },
    true,
    new Set(),
  );
};

// A minimal mock UIState to satisfy the context provider.
// Tests that need specific UIState values should provide their own.
const baseMockUiState = {
  mainAreaWidth: 100,
  terminalWidth: 120,
};

export const renderWithProviders = (
  component: React.ReactElement,
  {
    shellFocus = true,
    settings = mockSettings,
    uiState: providedUiState,
    width,
    config = configProxy as unknown as Config,
  }: {
    shellFocus?: boolean;
    settings?: LoadedSettings;
    uiState?: Partial<UIState>;
    width?: number;
    config?: Config;
  } = {},
): ReturnType<typeof render> => {
  const baseState: UIState = new Proxy(
    { ...baseMockUiState, ...providedUiState },
    {
      get(target, prop) {
        if (prop in target) {
          return target[prop as keyof typeof target];
        }
        // For properties not in the base mock or provided state,
        // we'll check the original proxy to see if it's a defined but
        // unprovided property, and if not, throw.
        if (prop in baseMockUiState) {
          return baseMockUiState[prop as keyof typeof baseMockUiState];
        }
        throw new Error(`mockUiState does not have property ${String(prop)}`);
      },
    },
  ) as UIState;

  const terminalWidth = width ?? baseState.terminalWidth;
  const mainAreaWidth = calculateMainAreaWidth(terminalWidth, settings);

  const finalUiState = {
    ...baseState,
    terminalWidth,
    mainAreaWidth,
  };

  return render(
    <ConfigContext.Provider value={config}>
      <SettingsContext.Provider value={settings}>
        <UIStateContext.Provider value={finalUiState}>
          <VimModeProvider settings={settings}>
            <ShellFocusContext.Provider value={shellFocus}>
              <KeypressProvider kittyProtocolEnabled={true}>
                {component}
              </KeypressProvider>
            </ShellFocusContext.Provider>
          </VimModeProvider>
        </UIStateContext.Provider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>,
  );
};

/**
 * DRY Test Helper Factories - Centralized mock object creation
 */

/**
 * Creates a complete ToolCallDecisions object with all required fields
 */
export const createMockToolCallDecisions = (overrides?: {
  accept?: number;
  reject?: number;
  modify?: number;
  auto_accept?: number;
}): {
  accept: number;
  reject: number;
  modify: number;
  auto_accept: number;
} => ({
  accept: overrides?.accept ?? 0,
  reject: overrides?.reject ?? 0,
  modify: overrides?.modify ?? 0,
  auto_accept: overrides?.auto_accept ?? 0,
});

/**
 * Creates a complete SessionStatsState with all required fields
 */
export const createMockSessionStats = (
  overrides?: Partial<{
    sessionId: string;
    sessionStartTime: Date;
    lastPromptTokenCount: number;
    promptCount: number;
  }>,
): SessionStatsState => ({
  sessionId: overrides?.sessionId ?? 'test-session-id',
  sessionStartTime: overrides?.sessionStartTime ?? new Date(),
  metrics: {
    models: {},
    tools: {
      totalCalls: 0,
      totalSuccess: 0,
      totalFail: 0,
      totalDurationMs: 0,
      totalDecisions: createMockToolCallDecisions(),
      byName: {},
    },
    files: {
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
    },
  },
  lastPromptTokenCount: overrides?.lastPromptTokenCount ?? 0,
  promptCount: overrides?.promptCount ?? 0,
});

/**
 * Creates a complete KittyProtocolStatus with all required fields
 */
export const createMockKittyProtocolStatus = (overrides?: {
  supported?: boolean;
  enabled?: boolean;
  checking?: boolean;
}): KittyProtocolStatus => ({
  supported: overrides?.supported ?? false,
  enabled: overrides?.enabled ?? false,
  checking: overrides?.checking ?? false,
});

/**
 * Creates a complete TextBufferState with all required fields
 */
export const createMockTextBufferState = (
  overrides?: Partial<TextBufferState>,
): TextBufferState => ({
  lines: overrides?.lines ?? [''],
  cursorRow: overrides?.cursorRow ?? 0,
  cursorCol: overrides?.cursorCol ?? 0,
  preferredCol: overrides?.preferredCol ?? null,
  undoStack: overrides?.undoStack ?? [],
  redoStack: overrides?.redoStack ?? [],
  clipboard: overrides?.clipboard ?? null,
  selectionAnchor: overrides?.selectionAnchor ?? null,
  viewportWidth: overrides?.viewportWidth ?? 80,
  viewportHeight: overrides?.viewportHeight ?? 24,
  visualLayout: overrides?.visualLayout ?? {
    visualLines: [''],
    logicalToVisualMap: [[[0, 0]]],
    visualToLogicalMap: [[0, 0]],
  },
});
