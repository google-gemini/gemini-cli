/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render as inkRender } from 'ink-testing-library';
import { Box } from 'ink';
import type React from 'react';
import { vi } from 'vitest';
import { act, useState } from 'react';
import os from 'node:os';
import { LoadedSettings } from '../config/settings.js';
import { KeypressProvider } from '../ui/contexts/KeypressContext.js';
import { SettingsContext } from '../ui/contexts/SettingsContext.js';
import { ShellFocusContext } from '../ui/contexts/ShellFocusContext.js';
import { UIStateContext, type UIState } from '../ui/contexts/UIStateContext.js';
import { ConfigContext } from '../ui/contexts/ConfigContext.js';
import { VimModeProvider } from '../ui/contexts/VimModeContext.js';
import { MouseProvider } from '../ui/contexts/MouseContext.js';
import { ScrollProvider } from '../ui/contexts/ScrollProvider.js';
import { StreamingContext } from '../ui/contexts/StreamingContext.js';
import {
  type UIActions,
  UIActionsContext,
} from '../ui/contexts/UIActionsContext.js';
import { type HistoryItemToolGroup, StreamingState } from '../ui/types.js';
import { ToolActionsProvider } from '../ui/contexts/ToolActionsContext.js';
import { AskUserActionsProvider } from '../ui/contexts/AskUserActionsContext.js';
import { TerminalProvider } from '../ui/contexts/TerminalContext.js';

import { makeFakeConfig, type Config } from '@google/gemini-cli-core';
import { FakePersistentState } from './persistentStateFake.js';
import { AppContext, type AppState } from '../ui/contexts/AppContext.js';
import { createMockSettings } from './settings.js';

export const persistentStateMock = new FakePersistentState();

vi.mock('../utils/persistentState.js', () => ({
  persistentState: persistentStateMock,
}));

vi.mock('../ui/utils/terminalUtils.js', () => ({
  isLowColorDepth: vi.fn(() => false),
  getColorDepth: vi.fn(() => 24),
  isITerm2: vi.fn(() => false),
}));

// Wrapper around ink-testing-library's render that ensures act() is called
export const render = (
  tree: React.ReactElement,
  terminalWidth?: number,
): ReturnType<typeof inkRender> => {
  let renderResult: ReturnType<typeof inkRender> =
    undefined as unknown as ReturnType<typeof inkRender>;
  act(() => {
    renderResult = inkRender(tree);
  });

  if (terminalWidth !== undefined && renderResult?.stdout) {
    // Override the columns getter on the stdout instance provided by ink-testing-library
    Object.defineProperty(renderResult.stdout, 'columns', {
      get: () => terminalWidth,
      configurable: true,
    });

    // Trigger a rerender so Ink can pick up the new terminal width
    act(() => {
      renderResult.rerender(tree);
    });
  }

  const originalUnmount = renderResult.unmount;
  const originalRerender = renderResult.rerender;

  return {
    ...renderResult,
    unmount: () => {
      act(() => {
        originalUnmount();
      });
    },
    rerender: (newTree: React.ReactElement) => {
      act(() => {
        originalRerender(newTree);
      });
    },
  };
};

export const simulateClick = async (
  stdin: ReturnType<typeof inkRender>['stdin'],
  col: number,
  row: number,
  button: 0 | 1 | 2 = 0, // 0 for left, 1 for middle, 2 for right
) => {
  // Terminal mouse events are 1-based, so convert if necessary.
  const mouseEventString = `\x1b[<${button};${col};${row}M`;
  await act(async () => {
    stdin.write(mouseEventString);
  });
};

let mockConfigInternal: Config | undefined;

const getMockConfigInternal = (): Config => {
  if (!mockConfigInternal) {
    mockConfigInternal = makeFakeConfig({
      targetDir: os.tmpdir(),
      enableEventDrivenScheduler: true,
    });
  }
  return mockConfigInternal;
};

const configProxy = new Proxy({} as Config, {
  get(_target, prop) {
    if (prop === 'getTargetDir') {
      return () =>
        '/Users/test/project/foo/bar/and/some/more/directories/to/make/it/long';
    }
    const internal = getMockConfigInternal();
    if (prop in internal) {
      return internal[prop as keyof typeof internal];
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
  [],
);

// A minimal mock UIState to satisfy the context provider.
// Tests that need specific UIState values should provide their own.
const baseMockUiState = {
  renderMarkdown: true,
  streamingState: StreamingState.Idle,
  terminalWidth: 120,
  terminalHeight: 40,
  currentModel: 'gemini-pro',
  terminalBackgroundColor: undefined,
  activePtyId: undefined,
  backgroundShells: new Map(),
  backgroundShellHeight: 0,
};

export const mockAppState: AppState = {
  version: '1.2.3',
  startupWarnings: [],
};

const mockUIActions: UIActions = {
  handleThemeSelect: vi.fn(),
  closeThemeDialog: vi.fn(),
  handleThemeHighlight: vi.fn(),
  handleAuthSelect: vi.fn(),
  setAuthState: vi.fn(),
  onAuthError: vi.fn(),
  handleEditorSelect: vi.fn(),
  exitEditorDialog: vi.fn(),
  exitPrivacyNotice: vi.fn(),
  closeSettingsDialog: vi.fn(),
  closeModelDialog: vi.fn(),
  openAgentConfigDialog: vi.fn(),
  closeAgentConfigDialog: vi.fn(),
  openPermissionsDialog: vi.fn(),
  openSessionBrowser: vi.fn(),
  closeSessionBrowser: vi.fn(),
  handleResumeSession: vi.fn(),
  handleDeleteSession: vi.fn(),
  closePermissionsDialog: vi.fn(),
  setShellModeActive: vi.fn(),
  vimHandleInput: vi.fn(),
  handleIdePromptComplete: vi.fn(),
  handleFolderTrustSelect: vi.fn(),
  setConstrainHeight: vi.fn(),
  onEscapePromptChange: vi.fn(),
  refreshStatic: vi.fn(),
  handleFinalSubmit: vi.fn(),
  handleClearScreen: vi.fn(),
  handleProQuotaChoice: vi.fn(),
  handleValidationChoice: vi.fn(),
  setQueueErrorMessage: vi.fn(),
  popAllMessages: vi.fn(),
  handleApiKeySubmit: vi.fn(),
  handleApiKeyCancel: vi.fn(),
  setBannerVisible: vi.fn(),
  setShortcutsHelpVisible: vi.fn(),
  setEmbeddedShellFocused: vi.fn(),
  dismissBackgroundShell: vi.fn(),
  setActiveBackgroundShellPid: vi.fn(),
  setIsBackgroundShellListOpen: vi.fn(),
  setAuthContext: vi.fn(),
  handleWarning: vi.fn(),
  handleRestart: vi.fn(),
  handleNewAgentsSelect: vi.fn(),
};

export const renderWithProviders = (
  component: React.ReactElement,
  {
    shellFocus = true,
    settings = mockSettings,
    uiState: providedUiState,
    width,
    mouseEventsEnabled = false,
    config = configProxy as unknown as Config,
    useAlternateBuffer = true,
    uiActions,
    persistentState,
    appState = mockAppState,
  }: {
    shellFocus?: boolean;
    settings?: LoadedSettings;
    uiState?: Partial<UIState>;
    width?: number;
    mouseEventsEnabled?: boolean;
    config?: Config;
    useAlternateBuffer?: boolean;
    uiActions?: Partial<UIActions>;
    persistentState?: {
      get?: typeof persistentStateMock.get;
      set?: typeof persistentStateMock.set;
    };
    appState?: AppState;
  } = {},
): ReturnType<typeof render> & { simulateClick: typeof simulateClick } => {
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

  if (persistentState?.get) {
    persistentStateMock.get.mockImplementation(persistentState.get);
  }
  if (persistentState?.set) {
    persistentStateMock.set.mockImplementation(persistentState.set);
  }

  persistentStateMock.mockClear();

  const terminalWidth = width ?? baseState.terminalWidth;
  let finalSettings = settings;
  if (useAlternateBuffer !== undefined) {
    finalSettings = createMockSettings({
      ...settings.merged,
      ui: {
        ...settings.merged.ui,
        useAlternateBuffer,
      },
    });
  }

  const mainAreaWidth = terminalWidth;

  const finalUiState = {
    ...baseState,
    terminalWidth,
    mainAreaWidth,
  };

  const finalUIActions = { ...mockUIActions, ...uiActions };

  const allToolCalls = (finalUiState.pendingHistoryItems || [])
    .filter((item): item is HistoryItemToolGroup => item.type === 'tool_group')
    .flatMap((item) => item.tools);

  const renderResult = render(
    <AppContext.Provider value={appState}>
      <ConfigContext.Provider value={config}>
        <SettingsContext.Provider value={finalSettings}>
          <UIStateContext.Provider value={finalUiState}>
            <VimModeProvider settings={finalSettings}>
              <ShellFocusContext.Provider value={shellFocus}>
                <StreamingContext.Provider value={finalUiState.streamingState}>
                  <UIActionsContext.Provider value={finalUIActions}>
                    <ToolActionsProvider
                      config={config}
                      toolCalls={allToolCalls}
                    >
                      <AskUserActionsProvider
                        request={null}
                        onSubmit={vi.fn()}
                        onCancel={vi.fn()}
                      >
                        <KeypressProvider>
                          <MouseProvider
                            mouseEventsEnabled={mouseEventsEnabled}
                          >
                            <TerminalProvider>
                              <ScrollProvider>
                                <Box
                                  width={terminalWidth}
                                  flexShrink={0}
                                  flexGrow={0}
                                  flexDirection="column"
                                >
                                  {component}
                                </Box>
                              </ScrollProvider>
                            </TerminalProvider>
                          </MouseProvider>
                        </KeypressProvider>
                      </AskUserActionsProvider>
                    </ToolActionsProvider>
                  </UIActionsContext.Provider>
                </StreamingContext.Provider>
              </ShellFocusContext.Provider>
            </VimModeProvider>
          </UIStateContext.Provider>
        </SettingsContext.Provider>
      </ConfigContext.Provider>
    </AppContext.Provider>,
    terminalWidth,
  );

  return { ...renderResult, simulateClick };
};

export function renderHook<Result, Props>(
  renderCallback: (props: Props) => Result,
  options?: {
    initialProps?: Props;
    wrapper?: React.ComponentType<{ children: React.ReactNode }>;
  },
): {
  result: { current: Result };
  rerender: (props?: Props) => void;
  unmount: () => void;
} {
  const result = { current: undefined as unknown as Result };
  let currentProps = options?.initialProps as Props;

  function TestComponent({
    renderCallback,
    props,
  }: {
    renderCallback: (props: Props) => Result;
    props: Props;
  }) {
    result.current = renderCallback(props);
    return null;
  }

  const Wrapper = options?.wrapper || (({ children }) => <>{children}</>);

  let inkRerender: (tree: React.ReactElement) => void = () => {};
  let unmount: () => void = () => {};

  act(() => {
    const renderResult = render(
      <Wrapper>
        <TestComponent renderCallback={renderCallback} props={currentProps} />
      </Wrapper>,
    );
    inkRerender = renderResult.rerender;
    unmount = renderResult.unmount;
  });

  function rerender(props?: Props) {
    if (arguments.length > 0) {
      currentProps = props as Props;
    }
    act(() => {
      inkRerender(
        <Wrapper>
          <TestComponent renderCallback={renderCallback} props={currentProps} />
        </Wrapper>,
      );
    });
  }

  return { result, rerender, unmount };
}

export function renderHookWithProviders<Result, Props>(
  renderCallback: (props: Props) => Result,
  options: {
    initialProps?: Props;
    wrapper?: React.ComponentType<{ children: React.ReactNode }>;
    // Options for renderWithProviders
    shellFocus?: boolean;
    settings?: LoadedSettings;
    uiState?: Partial<UIState>;
    width?: number;
    mouseEventsEnabled?: boolean;
    config?: Config;
    useAlternateBuffer?: boolean;
  } = {},
): {
  result: { current: Result };
  rerender: (props?: Props) => void;
  unmount: () => void;
} {
  const result = { current: undefined as unknown as Result };

  let setPropsFn: ((props: Props) => void) | undefined;
  let forceUpdateFn: (() => void) | undefined;

  function TestComponent({ initialProps }: { initialProps: Props }) {
    const [props, setProps] = useState(initialProps);
    const [, forceUpdate] = useState(0);
    setPropsFn = setProps;
    forceUpdateFn = () => forceUpdate((n) => n + 1);
    result.current = renderCallback(props);
    return null;
  }

  const Wrapper = options.wrapper || (({ children }) => <>{children}</>);

  let renderResult: ReturnType<typeof render>;

  act(() => {
    renderResult = renderWithProviders(
      <Wrapper>
        <TestComponent initialProps={options.initialProps as Props} />
      </Wrapper>,
      options,
    );
  });

  function rerender(newProps?: Props) {
    act(() => {
      if (arguments.length > 0 && setPropsFn) {
        setPropsFn(newProps as Props);
      } else if (forceUpdateFn) {
        forceUpdateFn();
      }
    });
  }

  return {
    result,
    rerender,
    unmount: () => {
      act(() => {
        renderResult.unmount();
      });
    },
  };
}
