/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  render as inkRenderDirect,
  type Instance as InkInstance,
  type RenderOptions,
} from 'ink';
import { EventEmitter } from 'node:events';
import { Box } from 'ink';
import type React from 'react';
import { Terminal } from '@xterm/headless';
import { vi } from 'vitest';
import stripAnsi from 'strip-ansi';
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
import {
  OverflowProvider,
  useOverflowActions,
  useOverflowState,
  type OverflowActions,
  type OverflowState,
} from '../ui/contexts/OverflowContext.js';

import { makeFakeConfig, type Config } from '@google/gemini-cli-core';
import { FakePersistentState } from './persistentStateFake.js';
import { AppContext, type AppState } from '../ui/contexts/AppContext.js';
import { createMockSettings } from './settings.js';
import { SessionStatsProvider } from '../ui/contexts/SessionContext.js';
import { themeManager, DEFAULT_THEME } from '../ui/themes/theme-manager.js';
import { DefaultLight } from '../ui/themes/default-light.js';
import { pickDefaultThemeName } from '../ui/themes/theme.js';

export const persistentStateMock = new FakePersistentState();

if (process.env['NODE_ENV'] === 'test') {
  // We mock NODE_ENV to development during tests that use render.tsx
  // so that animations (which check process.env.NODE_ENV !== 'test')
  // are actually tested. We mutate process.env directly here because
  // vi.stubEnv() is cleared by vi.unstubAllEnvs() in test-setup.ts
  // after each test.
  process.env['NODE_ENV'] = 'development';
}

vi.mock('../utils/persistentState.js', () => ({
  persistentState: persistentStateMock,
}));

vi.mock('../ui/utils/terminalUtils.js', () => ({
  isLowColorDepth: vi.fn(() => false),
  getColorDepth: vi.fn(() => 24),
  isITerm2: vi.fn(() => false),
}));

type TerminalState = {
  terminal: Terminal;
  cols: number;
  rows: number;
};

type RenderMetrics = Parameters<NonNullable<RenderOptions['onRender']>>[0];

interface InkRenderMetrics extends RenderMetrics {
  output: string;
  staticOutput?: string;
}

function isInkRenderMetrics(
  metrics: RenderMetrics,
): metrics is InkRenderMetrics {
  const m = metrics as Record<string, unknown>;
  return (
    typeof m === 'object' &&
    m !== null &&
    'output' in m &&
    typeof m['output'] === 'string'
  );
}

class XtermStdout extends EventEmitter {
  private state: TerminalState;
  private pendingWrites = 0;
  private renderCount = 0;
  private queue: { promise: Promise<void> };
  isTTY = true;

  private lastRenderOutput: string | undefined = undefined;

  constructor(state: TerminalState, queue: { promise: Promise<void> }) {
    super();
    this.state = state;
    this.queue = queue;
  }

  get columns() {
    return this.state.terminal.cols;
  }

  get rows() {
    return this.state.terminal.rows;
  }

  get frames(): string[] {
    return [];
  }

  write = (data: string) => {
    this.pendingWrites++;
    this.queue.promise = this.queue.promise.then(async () => {
      await new Promise<void>((resolve) =>
        this.state.terminal.write(data, resolve),
      );
      this.pendingWrites--;
    });
  };

  clear = () => {
    this.state.terminal.reset();
    this.lastRenderOutput = undefined;
  };

  dispose = () => {
    this.state.terminal.dispose();
  };

  onRender = (staticContent: string, output: string) => {
    this.renderCount++;
    this.lastRenderOutput = output;
    this.emit('render');
  };

  lastFrame = (options: { allowEmpty?: boolean } = {}) => {
    const buffer = this.state.terminal.buffer.active;
    const allLines: string[] = [];
    for (let i = 0; i < buffer.length; i++) {
      allLines.push(buffer.getLine(i)?.translateToString(true) ?? '');
    }

    const trimmed = [...allLines];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') {
      trimmed.pop();
    }
    const result = trimmed.join('\n');

    // Normalize for cross-platform snapshot stability:
    // Normalize any \r\n to \n
    const normalized = result.replace(/\r\n/g, '\n');

    if (normalized === '' && !options.allowEmpty) {
      throw new Error(
        'lastFrame() returned an empty string. If this is intentional, use lastFrame({ allowEmpty: true }). ' +
          'Otherwise, ensure you are calling await waitUntilReady() and that the component is rendering correctly.',
      );
    }
    return normalized === '' ? normalized : normalized + '\n';
  };

  async waitUntilReady() {
    const startRenderCount = this.renderCount;
    if (!vi.isFakeTimers()) {
      // Give Ink a chance to start its rendering loop
      await new Promise((resolve) => setImmediate(resolve));
    }
    await act(async () => {
      if (vi.isFakeTimers()) {
        await vi.advanceTimersByTimeAsync(50);
      } else {
        // Wait for at least one render to be called if we haven't rendered yet or since start of this call,
        // but don't wait forever as some renders might be synchronous or skipped.
        if (this.renderCount === startRenderCount) {
          const renderPromise = new Promise((resolve) =>
            this.once('render', resolve),
          );
          const timeoutPromise = new Promise((resolve) =>
            setTimeout(resolve, 50),
          );
          await Promise.race([renderPromise, timeoutPromise]);
        }
      }
    });

    let attempts = 0;
    const maxAttempts = 50;

    let lastCurrent = '';
    let lastExpected = '';

    while (attempts < maxAttempts) {
      // Ensure all pending writes to the terminal are processed.
      await this.queue.promise;

      const currentFrame = stripAnsi(
        this.lastFrame({ allowEmpty: true }),
      ).trim();
      const expectedFrame = stripAnsi(this.lastRenderOutput ?? '')
        .trim()
        .replace(/\r\n/g, '\n');

      lastCurrent = currentFrame;
      lastExpected = expectedFrame;

      const isMatch = () => {
        if (expectedFrame === '...') {
          return currentFrame !== '';
        }

        // If both are empty, it's a match.
        // We consider undefined lastRenderOutput as effectively empty for this check
        // to support hook testing where Ink may skip rendering completely.
        if (
          (this.lastRenderOutput === undefined || expectedFrame === '') &&
          currentFrame === ''
        ) {
          return true;
        }

        if (this.lastRenderOutput === undefined) {
          return false;
        }

        // If Ink expects nothing but terminal has content, or vice-versa, it's NOT a match.
        if (expectedFrame === '' || currentFrame === '') {
          return false;
        }

        // Check if the current frame contains the expected content.
        // We use includes because xterm might have some formatting or
        // extra whitespace that Ink doesn't account for in its raw output metrics.
        return currentFrame.includes(expectedFrame);
      };

      if (this.pendingWrites === 0 && isMatch()) {
        return;
      }

      attempts++;
      await act(async () => {
        if (vi.isFakeTimers()) {
          await vi.advanceTimersByTimeAsync(10);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      });
    }

    throw new Error(
      `waitUntilReady() timed out after ${maxAttempts} attempts.\n` +
        `Expected content (stripped ANSI):\n"${lastExpected}"\n` +
        `Actual content (stripped ANSI):\n"${lastCurrent}"\n` +
        `Pending writes: ${this.pendingWrites}\n` +
        `Render count: ${this.renderCount}`,
    );
  }
}

class XtermStderr extends EventEmitter {
  private state: TerminalState;
  private pendingWrites = 0;
  private queue: { promise: Promise<void> };
  isTTY = true;

  constructor(state: TerminalState, queue: { promise: Promise<void> }) {
    super();
    this.state = state;
    this.queue = queue;
  }

  write = (data: string) => {
    this.pendingWrites++;
    this.queue.promise = this.queue.promise.then(async () => {
      await new Promise<void>((resolve) =>
        this.state.terminal.write(data, resolve),
      );
      this.pendingWrites--;
    });
  };

  dispose = () => {
    this.state.terminal.dispose();
  };

  lastFrame = () => '';
}

class XtermStdin extends EventEmitter {
  isTTY = true;
  data: string | null = null;
  constructor(options: { isTTY?: boolean } = {}) {
    super();
    this.isTTY = options.isTTY ?? true;
  }

  write = (data: string) => {
    this.data = data;
    this.emit('readable');
    this.emit('data', data);
  };

  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}

  read = () => {
    const { data } = this;
    this.data = null;
    return data;
  };
}

export type RenderInstance = {
  rerender: (tree: React.ReactElement) => void;
  unmount: () => void;
  cleanup: () => void;
  stdout: XtermStdout;
  stderr: XtermStderr;
  stdin: XtermStdin;
  frames: string[];
  lastFrame: (options?: { allowEmpty?: boolean }) => string;
  terminal: Terminal;
  waitUntilReady: () => Promise<void>;
  capturedOverflowState: OverflowState | undefined;
  capturedOverflowActions: OverflowActions | undefined;
};

const instances: InkInstance[] = [];

// Wrapper around ink's render that ensures act() is called and uses Xterm for output
export const render = (
  tree: React.ReactElement,
  terminalWidth?: number,
): Omit<
  RenderInstance,
  'capturedOverflowState' | 'capturedOverflowActions'
> => {
  const cols = terminalWidth ?? 100;
  // We use 1000 rows to avoid windows with incorrect snapshots if a correct
  // value was used (e.g. 40 rows). The alternatives to make things worse are
  // windows unfortunately with odd duplicate content in the backbuffer
  // which does not match actual behavior in xterm.js on windows.
  const rows = 1000;
  const terminal = new Terminal({
    cols,
    rows,
    allowProposedApi: true,
    convertEol: true,
  });

  const state: TerminalState = {
    terminal,
    cols,
    rows,
  };
  const writeQueue = { promise: Promise.resolve() };
  const stdout = new XtermStdout(state, writeQueue);
  const stderr = new XtermStderr(state, writeQueue);
  const stdin = new XtermStdin();

  let instance!: InkInstance;
  stdout.clear();
  act(() => {
    instance = inkRenderDirect(tree, {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      stdout: stdout as unknown as NodeJS.WriteStream,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      stderr: stderr as unknown as NodeJS.WriteStream,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: false,
      exitOnCtrlC: false,
      patchConsole: false,
      onRender: (metrics: RenderMetrics) => {
        if (isInkRenderMetrics(metrics)) {
          stdout.onRender(metrics.staticOutput ?? '', metrics.output);
        }
      },
    });
  });

  instances.push(instance);

  return {
    rerender: (newTree: React.ReactElement) => {
      act(() => {
        stdout.clear();
        instance.rerender(newTree);
      });
    },
    unmount: () => {
      act(() => {
        instance.unmount();
      });
      stdout.dispose();
      stderr.dispose();
    },
    cleanup: instance.cleanup,
    stdout,
    stderr,
    stdin,
    frames: stdout.frames,
    lastFrame: stdout.lastFrame,
    terminal: state.terminal,
    waitUntilReady: () => stdout.waitUntilReady(),
  };
};

export const cleanup = () => {
  for (const instance of instances) {
    act(() => {
      instance.unmount();
    });
    instance.cleanup();
  }
  instances.length = 0;
};

export const simulateClick = async (
  stdin: XtermStdin,
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const configProxy = new Proxy({} as Config, {
  get(_target, prop) {
    if (prop === 'getTargetDir') {
      return () =>
        '/Users/test/project/foo/bar/and/some/more/directories/to/make/it/long';
    }
    if (prop === 'getUseBackgroundColor') {
      return () => true;
    }
    const internal = getMockConfigInternal();
    if (prop in internal) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
  terminalWidth: 100,
  terminalHeight: 40,
  currentModel: 'gemini-pro',
  terminalBackgroundColor: 'black',
  cleanUiDetailsVisible: false,
  allowPlanMode: true,
  activePtyId: undefined,
  backgroundShells: new Map(),
  backgroundShellHeight: 0,
  quota: {
    userTier: undefined,
    stats: undefined,
    proQuotaRequest: null,
    validationRequest: null,
  },
  hintMode: false,
  hintBuffer: '',
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
  setIsPolicyUpdateDialogOpen: vi.fn(),
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
  setCleanUiDetailsVisible: vi.fn(),
  toggleCleanUiDetailsVisible: vi.fn(),
  revealCleanUiDetailsTemporarily: vi.fn(),
  handleWarning: vi.fn(),
  setEmbeddedShellFocused: vi.fn(),
  dismissBackgroundShell: vi.fn(),
  setActiveBackgroundShellPid: vi.fn(),
  setIsBackgroundShellListOpen: vi.fn(),
  setAuthContext: vi.fn(),
  onHintInput: vi.fn(),
  onHintBackspace: vi.fn(),
  onHintClear: vi.fn(),
  onHintSubmit: vi.fn(),
  handleRestart: vi.fn(),
  handleNewAgentsSelect: vi.fn(),
};

let capturedOverflowState: OverflowState | undefined;
let capturedOverflowActions: OverflowActions | undefined;
const ContextCapture: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  capturedOverflowState = useOverflowState();
  capturedOverflowActions = useOverflowActions();
  return <>{children}</>;
};

export const renderWithProviders = (
  component: React.ReactElement,
  {
    shellFocus = true,
    settings = mockSettings,
    uiState: providedUiState,
    width,
    mouseEventsEnabled = false,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
): RenderInstance & {
  simulateClick: (
    col: number,
    row: number,
    button?: 0 | 1 | 2,
  ) => Promise<void>;
} => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const baseState: UIState = new Proxy(
    { ...baseMockUiState, ...providedUiState },
    {
      get(target, prop) {
        if (prop in target) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          return target[prop as keyof typeof target];
        }
        // For properties not in the base mock or provided state,
        // we'll check the original proxy to see if it's a defined but
        // unprovided property, and if not, throw.
        if (prop in baseMockUiState) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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

  themeManager.setTerminalBackground(baseState.terminalBackgroundColor);
  const themeName = pickDefaultThemeName(
    baseState.terminalBackgroundColor,
    themeManager.getAllThemes(),
    DEFAULT_THEME.name,
    DefaultLight.name,
  );
  themeManager.setActiveTheme(themeName);

  const finalUIActions = { ...mockUIActions, ...uiActions };

  const allToolCalls = (finalUiState.pendingHistoryItems || [])
    .filter((item): item is HistoryItemToolGroup => item.type === 'tool_group')
    .flatMap((item) => item.tools);

  capturedOverflowState = undefined;
  capturedOverflowActions = undefined;

  const renderResult = render(
    <AppContext.Provider value={appState}>
      <ConfigContext.Provider value={config}>
        <SettingsContext.Provider value={finalSettings}>
          <UIStateContext.Provider value={finalUiState}>
            <VimModeProvider settings={finalSettings}>
              <ShellFocusContext.Provider value={shellFocus}>
                <SessionStatsProvider>
                  <StreamingContext.Provider
                    value={finalUiState.streamingState}
                  >
                    <UIActionsContext.Provider value={finalUIActions}>
                      <OverflowProvider>
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
                                    <ContextCapture>
                                      <Box
                                        width={terminalWidth}
                                        flexShrink={0}
                                        flexGrow={0}
                                        flexDirection="column"
                                      >
                                        {component}
                                      </Box>
                                    </ContextCapture>
                                  </ScrollProvider>
                                </TerminalProvider>
                              </MouseProvider>
                            </KeypressProvider>
                          </AskUserActionsProvider>
                        </ToolActionsProvider>
                      </OverflowProvider>
                    </UIActionsContext.Provider>
                  </StreamingContext.Provider>
                </SessionStatsProvider>
              </ShellFocusContext.Provider>
            </VimModeProvider>
          </UIStateContext.Provider>
        </SettingsContext.Provider>
      </ConfigContext.Provider>
    </AppContext.Provider>,
    terminalWidth,
  );

  return {
    ...renderResult,
    capturedOverflowState,
    capturedOverflowActions,
    simulateClick: (col: number, row: number, button?: 0 | 1 | 2) =>
      simulateClick(renderResult.stdin, col, row, button),
  };
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
  waitUntilReady: () => Promise<void>;
} {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const result = { current: undefined as unknown as Result };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
  let waitUntilReady: () => Promise<void> = async () => {};

  act(() => {
    const renderResult = render(
      <Wrapper>
        <TestComponent renderCallback={renderCallback} props={currentProps} />
      </Wrapper>,
    );
    inkRerender = renderResult.rerender;
    unmount = renderResult.unmount;
    waitUntilReady = renderResult.waitUntilReady;
  });

  function rerender(props?: Props) {
    if (arguments.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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

  return { result, rerender, unmount, waitUntilReady };
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
  waitUntilReady: () => Promise<void>;
} {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
        {/* eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion */}
        <TestComponent initialProps={options.initialProps as Props} />
      </Wrapper>,
      options,
    );
  });

  function rerender(newProps?: Props) {
    act(() => {
      if (arguments.length > 0 && setPropsFn) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
    waitUntilReady: () => renderResult.waitUntilReady(),
  };
}
