/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import type React from 'react';
import { render } from '../test-utils/render.js';
import { Text, useIsScreenReaderEnabled, type DOMElement } from 'ink';
import { makeFakeConfig, type Config } from '@google/gemini-cli-core';
import { App } from './App.js';
import { UIStateContext, type UIState } from './contexts/UIStateContext.js';
import {
  type HistoryItemToolGroup,
  StreamingState,
  ToolCallStatus,
} from './types.js';
import { ConfigContext } from './contexts/ConfigContext.js';
import { AppContext } from './contexts/AppContext.js';
import { SettingsContext } from './contexts/SettingsContext.js';
import { LoadedSettings, type SettingsFile } from '../config/settings.js';

import { ToolActionsProvider } from './contexts/ToolActionsContext.js';
import { KeypressProvider } from './contexts/KeypressContext.js';

vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useIsScreenReaderEnabled: vi.fn(),
  };
});

vi.mock('./components/MainContent.js', () => ({
  MainContent: () => <Text>MainContent</Text>,
}));

vi.mock('./components/DialogManager.js', () => ({
  DialogManager: () => <Text>DialogManager</Text>,
}));

vi.mock('./components/Composer.js', () => ({
  Composer: () => <Text>Composer</Text>,
}));

vi.mock('./components/Notifications.js', () => ({
  Notifications: () => <Text>Notifications</Text>,
}));

vi.mock('./components/QuittingDisplay.js', () => ({
  QuittingDisplay: () => <Text>Quitting...</Text>,
}));

vi.mock('./components/HistoryItemDisplay.js', () => ({
  HistoryItemDisplay: () => <Text>HistoryItemDisplay</Text>,
}));

vi.mock('./components/Footer.js', () => ({
  Footer: () => <Text>Footer</Text>,
}));

describe('App', () => {
  const mockUIState: Partial<UIState> = {
    streamingState: StreamingState.Idle,
    quittingMessages: null,
    dialogsVisible: false,
    mainControlsRef: {
      current: null,
    } as unknown as React.MutableRefObject<DOMElement | null>,
    rootUiRef: {
      current: null,
    } as unknown as React.MutableRefObject<DOMElement | null>,
    historyManager: {
      addItem: vi.fn(),
      history: [],
      updateItem: vi.fn(),
      clearItems: vi.fn(),
      loadHistory: vi.fn(),
    },
    history: [],
    pendingHistoryItems: [],
    pendingGeminiHistoryItems: [],
    bannerData: {
      defaultText: 'Mock Banner Text',
      warningText: '',
    },
  };

  const mockConfig = makeFakeConfig();

  const mockSettingsFile: SettingsFile = {
    settings: {},
    originalSettings: {},
    path: '/mock/path',
  };

  const mockLoadedSettings = new LoadedSettings(
    mockSettingsFile,
    mockSettingsFile,
    mockSettingsFile,
    mockSettingsFile,
    true,
    [],
  );

  const mockAppState = {
    version: '1.0.0',
    startupWarnings: [],
  };

  const renderWithProviders = (
    ui: React.ReactElement,
    state: Partial<UIState>,
    config: Config = mockConfig,
  ) => {
    const allToolCalls = (state.pendingHistoryItems || [])
      .filter(
        (item): item is HistoryItemToolGroup => item.type === 'tool_group',
      )
      .flatMap((item) => item.tools);

    return render(
      <AppContext.Provider value={mockAppState}>
        <ConfigContext.Provider value={config}>
          <SettingsContext.Provider value={mockLoadedSettings}>
            <UIStateContext.Provider value={state as UIState}>
              <KeypressProvider>
                <ToolActionsProvider config={config} toolCalls={allToolCalls}>
                  {ui}
                </ToolActionsProvider>
              </KeypressProvider>
            </UIStateContext.Provider>
          </SettingsContext.Provider>
        </ConfigContext.Provider>
      </AppContext.Provider>,
    );
  };

  it('should render main content and composer when not quitting', () => {
    const { lastFrame } = renderWithProviders(<App />, mockUIState);

    expect(lastFrame()).toContain('MainContent');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('Composer');
  });

  it('should render quitting display when quittingMessages is set', () => {
    const quittingUIState = {
      ...mockUIState,
      quittingMessages: [{ id: 1, type: 'user', text: 'test' }],
    } as UIState;

    const { lastFrame } = renderWithProviders(<App />, quittingUIState);

    expect(lastFrame()).toContain('Quitting...');
  });

  it('should render full history in alternate buffer mode when quittingMessages is set', () => {
    const quittingUIState = {
      ...mockUIState,
      quittingMessages: [{ id: 1, type: 'user', text: 'test' }],
      history: [{ id: 1, type: 'user', text: 'history item' }],
      pendingHistoryItems: [{ type: 'user', text: 'pending item' }],
    } as UIState;

    mockLoadedSettings.merged.ui.useAlternateBuffer = true;

    const { lastFrame } = renderWithProviders(<App />, quittingUIState);

    expect(lastFrame()).toContain('HistoryItemDisplay');
    expect(lastFrame()).toContain('Quitting...');

    // Reset settings
    mockLoadedSettings.merged.ui.useAlternateBuffer = false;
  });

  it('should render dialog manager when dialogs are visible', () => {
    const dialogUIState = {
      ...mockUIState,
      dialogsVisible: true,
    } as UIState;

    const { lastFrame } = renderWithProviders(<App />, dialogUIState);

    expect(lastFrame()).toContain('MainContent');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('DialogManager');
  });

  it.each([
    { key: 'C', stateKey: 'ctrlCPressedOnce' },
    { key: 'D', stateKey: 'ctrlDPressedOnce' },
  ])(
    'should show Ctrl+$key exit prompt when dialogs are visible and $stateKey is true',
    ({ key, stateKey }) => {
      const uiState = {
        ...mockUIState,
        dialogsVisible: true,
        [stateKey]: true,
      } as UIState;

      const { lastFrame } = renderWithProviders(<App />, uiState);

      expect(lastFrame()).toContain(`Press Ctrl+${key} again to exit.`);
    },
  );

  it('should render ScreenReaderAppLayout when screen reader is enabled', () => {
    (useIsScreenReaderEnabled as Mock).mockReturnValue(true);

    const { lastFrame } = renderWithProviders(<App />, mockUIState as UIState);

    expect(lastFrame()).toContain(`Notifications
Footer
MainContent
Composer`);
  });

  it('should render DefaultAppLayout when screen reader is not enabled', () => {
    (useIsScreenReaderEnabled as Mock).mockReturnValue(false);

    const { lastFrame } = renderWithProviders(<App />, mockUIState as UIState);

    expect(lastFrame()).toContain(`MainContent
Notifications
Composer`);
  });

  it('should render ToolConfirmationQueue along with Composer when tool is confirming and experiment is on', () => {
    (useIsScreenReaderEnabled as Mock).mockReturnValue(false);

    const toolCalls = [
      {
        callId: 'call-1',
        name: 'ls',
        description: 'list directory',
        status: ToolCallStatus.Confirming,
        resultDisplay: '',
        confirmationDetails: {
          type: 'exec' as const,
          title: 'Confirm execution',
          command: 'ls',
          rootCommand: 'ls',
          rootCommands: ['ls'],
        },
      },
    ];

    const stateWithConfirmingTool = {
      ...mockUIState,
      pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
      pendingGeminiHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
    } as UIState;

    const configWithExperiment = {
      ...mockConfig,
      isEventDrivenSchedulerEnabled: () => true,
      isTrustedFolder: () => true,
      getIdeMode: () => false,
    } as unknown as Config;

    const { lastFrame } = renderWithProviders(
      <App />,
      stateWithConfirmingTool,
      configWithExperiment,
    );

    expect(lastFrame()).toContain('MainContent');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('Action Required'); // From ToolConfirmationQueue
    expect(lastFrame()).toContain('1 of 1');
    expect(lastFrame()).toContain('Composer');
    expect(lastFrame()).toMatchSnapshot();
  });

  describe('Snapshots', () => {
    it('renders default layout correctly', () => {
      (useIsScreenReaderEnabled as Mock).mockReturnValue(false);
      const { lastFrame } = renderWithProviders(
        <App />,
        mockUIState as UIState,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders screen reader layout correctly', () => {
      (useIsScreenReaderEnabled as Mock).mockReturnValue(true);
      const { lastFrame } = renderWithProviders(
        <App />,
        mockUIState as UIState,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders with dialogs visible', () => {
      const dialogUIState = {
        ...mockUIState,
        dialogsVisible: true,
      } as UIState;
      const { lastFrame } = renderWithProviders(<App />, dialogUIState);
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
