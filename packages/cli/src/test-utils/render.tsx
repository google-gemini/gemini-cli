/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import type React from 'react';
import { LoadedSettings } from '../config/settings.js';
import { KeypressProvider } from '../ui/contexts/KeypressContext.js';
import { SettingsContext } from '../ui/contexts/SettingsContext.js';
import { ShellFocusContext } from '../ui/contexts/ShellFocusContext.js';
import { UIStateContext, type UIState } from '../ui/contexts/UIStateContext.js';
import { StreamingState } from '../ui/types.js';

const mockSettings = new LoadedSettings(
  { path: '', settings: {}, originalSettings: {} },
  { path: '', settings: {}, originalSettings: {} },
  { path: '', settings: {}, originalSettings: {} },
  { path: '', settings: {}, originalSettings: {} },
  true,
  new Set(),
);

const mockUIState: UIState = {
  renderMarkdown: true,
  streamingState: StreamingState.Idle,
} as UIState;

export const renderWithProviders = (
  component: React.ReactElement,
  {
    shellFocus = true,
    settings = mockSettings,
    uiState = mockUIState,
  }: {
    shellFocus?: boolean;
    settings?: LoadedSettings;
    uiState?: Partial<UIState>;
  } = {},
): ReturnType<typeof render> =>
  render(
    <SettingsContext.Provider value={settings}>
      <ShellFocusContext.Provider value={shellFocus}>
        <UIStateContext.Provider value={{ ...mockUIState, ...uiState }}>
          <KeypressProvider kittyProtocolEnabled={true}>
            {component}
          </KeypressProvider>
        </UIStateContext.Provider>
      </ShellFocusContext.Provider>
    </SettingsContext.Provider>,
  );
