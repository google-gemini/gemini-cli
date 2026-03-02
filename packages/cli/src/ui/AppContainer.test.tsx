/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
  type MockedObject,
} from 'vitest';
import { render, cleanup, persistentStateMock } from '../test-utils/render.js';
import { waitFor } from '../test-utils/async.js';
import { act, useContext, type ReactElement } from 'react';
import { AppContainer } from './AppContainer.js';
import { SettingsContext } from './contexts/SettingsContext.js';
import { type TrackedToolCall } from './hooks/useToolScheduler.js';
import {
  type Config,
  makeFakeConfig,
  type ResumedSessionData,
  type StartupWarning,
  WarningPriority,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';

// Mock coreEvents
const mockCoreEvents = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  drainBacklogs: vi.fn(),
  emit: vi.fn(),
}));

// Mock IdeClient
const mockIdeClient = vi.hoisted(() => ({
  getInstance: vi.fn().mockReturnValue(new Promise(() => {})),
}));

// Mock stdout
const mocks = vi.hoisted(() => ({
  mockStdout: { write: vi.fn() },
}));
const terminalNotificationsMocks = vi.hoisted(() => ({
  notifyViaTerminal: vi.fn().mockResolvedValue(true),
  isNotificationsEnabled: vi.fn(() => true),
  buildRunEventNotificationContent: vi.fn((event) => ({
    title: 'Mock Notification',
    subtitle: 'Mock Subtitle',
    body: JSON.stringify(event),
  })),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    coreEvents: mockCoreEvents,
    IdeClient: mockIdeClient,
    writeToStdout: vi.fn((...args) =>
      process.stdout.write(
        ...(args as Parameters<typeof process.stdout.write>),
      ),
    ),
    writeToStderr: vi.fn((...args) =>
      process.stderr.write(
        ...(args as Parameters<typeof process.stderr.write>),
      ),
    ),
    patchStdio: vi.fn(() => () => {}),
    createWorkingStdio: vi.fn(() => ({
      stdout: process.stdout,
      stderr: process.stderr,
    })),
    enableMouseEvents: vi.fn(),
    disableMouseEvents: vi.fn(),
    FileDiscoveryService: vi.fn().mockImplementation(() => ({
      initialize: vi.fn(),
    })),
    startupProfiler: {
      flush: vi.fn(),
      start: vi.fn(),
      end: vi.fn(),
    },
  };
});
import { mergeSettings, type LoadedSettings } from '../config/settings.js';
import type { InitializationResult } from '../core/initializer.js';
import { useQuotaAndFallback } from './hooks/useQuotaAndFallback.js';
import { UIStateContext, type UIState } from './contexts/UIStateContext.js';
import {
  UIActionsContext,
  type UIActions,
} from './contexts/UIActionsContext.js';
import { KeypressProvider } from './contexts/KeypressContext.js';
import { OverflowProvider } from './contexts/OverflowContext.js';

// Mock useStdout to capture terminal title writes
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    useStdout: () => ({ stdout: mocks.mockStdout }),
    measureElement: vi.fn(),
  };
});

// Helper component will read the context values provided by AppContainer
// so we can assert against them in our tests.
let capturedUIState: UIState;
let capturedUIActions: UIActions;
function TestContextConsumer() {
  capturedUIState = useContext(UIStateContext)!;
  capturedUIActions = useContext(UIActionsContext)!;
  return null;
}

vi.mock('./App.js', () => ({
  App: TestContextConsumer,
}));

vi.mock('./hooks/useQuotaAndFallback.js');
vi.mock('./hooks/useHistoryManager.js');
vi.mock('./hooks/useThemeCommand.js');
vi.mock('./auth/useAuth.js');
vi.mock('./hooks/useEditorSettings.js');
vi.mock('./hooks/useSettingsCommand.js');
vi.mock('./hooks/useSettings.js');
vi.mock('./hooks/useModelCommand.js');
vi.mock('./hooks/slashCommandProcessor.js');
vi.mock('./hooks/useConsoleMessages.js');
vi.mock('./hooks/useTerminalSize.js', () => ({
  useTerminalSize: vi.fn(() => ({ columns: 80, rows: 24 })),
}));
vi.mock('./hooks/useGeminiStream.js');
vi.mock('./hooks/vim.js');
vi.mock('./hooks/useFocus.js');
vi.mock('./hooks/useBracketedPaste.js');
vi.mock('./hooks/useLoadingIndicator.js');
vi.mock('./hooks/useSuspend.js');
vi.mock('./hooks/useFolderTrust.js');
vi.mock('./hooks/useIdeTrustListener.js');
vi.mock('./hooks/useMessageQueue.js');
vi.mock('./hooks/useApprovalModeIndicator.js');
vi.mock('./hooks/useGitBranchName.js');
vi.mock('./contexts/VimModeContext.js');
vi.mock('./contexts/SessionContext.js');
vi.mock('./components/shared/text-buffer.js');
vi.mock('./hooks/useLogger.js');
vi.mock('./hooks/useInputHistoryStore.js');
vi.mock('./hooks/atCommandProcessor.js');
vi.mock('./hooks/useHookDisplayState.js');
vi.mock('./hooks/useBanner.js', () => ({
  useBanner: vi.fn((bannerData) => ({
    bannerText: (
      bannerData.warningText ||
      bannerData.defaultText ||
      ''
    ).replace(/\\n/g, '\n'),
  })),
}));
vi.mock('./hooks/useShellInactivityStatus.js', () => ({
  useShellInactivityStatus: vi.fn(() => ({
    shouldShowFocusHint: false,
    inactivityStatus: 'none',
  })),
}));
vi.mock('../utils/terminalNotifications.js', () => ({
  notifyViaTerminal: terminalNotificationsMocks.notifyViaTerminal,
  isNotificationsEnabled: terminalNotificationsMocks.isNotificationsEnabled,
  buildRunEventNotificationContent:
    terminalNotificationsMocks.buildRunEventNotificationContent,
}));
vi.mock('./hooks/useTerminalTheme.js', () => ({
  useTerminalTheme: vi.fn(),
}));

import { useHookDisplayState } from './hooks/useHookDisplayState.js';
import { useTerminalTheme } from './hooks/useTerminalTheme.js';
import { useShellInactivityStatus } from './hooks/useShellInactivityStatus.js';
import { useFocus } from './hooks/useFocus.js';

// Mock external utilities
vi.mock('../utils/events.js');
vi.mock('../utils/handleAutoUpdate.js');
vi.mock('./utils/ConsolePatcher.js');
vi.mock('../utils/cleanup.js');

import { useHistory } from './hooks/useHistoryManager.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useAuthCommand } from './auth/useAuth.js';
import { useEditorSettings } from './hooks/useEditorSettings.js';
import { useSettingsCommand } from './hooks/useSettingsCommand.js';
import { useModelCommand } from './hooks/useModelCommand.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useConsoleMessages } from './hooks/useConsoleMessages.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useVim } from './hooks/vim.js';
import { useFolderTrust } from './hooks/useFolderTrust.js';
import { useIdeTrustListener } from './hooks/useIdeTrustListener.js';
import { useMessageQueue } from './hooks/useMessageQueue.js';
import { useApprovalModeIndicator } from './hooks/useApprovalModeIndicator.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import { useVimMode } from './contexts/VimModeContext.js';
import { useSessionStats } from './contexts/SessionContext.js';
import { useTextBuffer } from './components/shared/text-buffer.js';
import { useLogger } from './hooks/useLogger.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useInputHistoryStore } from './hooks/useInputHistoryStore.js';
import { useSuspend } from './hooks/useSuspend.js';
import type { ExtensionManager } from '../config/extension-manager.js';

describe('AppContainer State Management', () => {
  let mockConfig: Config;
  let mockSettings: LoadedSettings;
  let mockInitResult: InitializationResult;
  let mockExtensionManager: MockedObject<ExtensionManager>;

  // Helper to generate the AppContainer JSX for render and rerender
  const getAppContainer = ({
    settings = mockSettings,
    config = mockConfig,
    version = '1.0.0',
    initResult = mockInitResult,
    startupWarnings,
    resumedSessionData,
  }: {
    settings?: LoadedSettings;
    config?: Config;
    version?: string;
    initResult?: InitializationResult;
    startupWarnings?: StartupWarning[];
    resumedSessionData?: ResumedSessionData;
  } = {}) => (
    <SettingsContext.Provider value={settings}>
      <KeypressProvider config={config}>
        <OverflowProvider>
          <AppContainer
            config={config}
            version={version}
            initializationResult={initResult}
            startupWarnings={startupWarnings}
            resumedSessionData={resumedSessionData}
          />
        </OverflowProvider>
      </KeypressProvider>
    </SettingsContext.Provider>
  );

  // Helper to render the AppContainer
  const renderAppContainer = (props?: Parameters<typeof getAppContainer>[0]) =>
    render(getAppContainer(props));

  // Create typed mocks for all hooks
  const mockedUseQuotaAndFallback = useQuotaAndFallback as Mock;
  const mockedUseHistory = useHistory as Mock;
  const mockedUseThemeCommand = useThemeCommand as Mock;
  const mockedUseAuthCommand = useAuthCommand as Mock;
  const mockedUseEditorSettings = useEditorSettings as Mock;
  const mockedUseSettingsCommand = useSettingsCommand as Mock;
  const mockedUseModelCommand = useModelCommand as Mock;
  const mockedUseSlashCommandProcessor = useSlashCommandProcessor as Mock;
  const mockedUseConsoleMessages = useConsoleMessages as Mock;
  const mockedUseGeminiStream = useGeminiStream as Mock;
  const mockedUseVim = useVim as Mock;
  const mockedUseFolderTrust = useFolderTrust as Mock;
  const mockedUseIdeTrustListener = useIdeTrustListener as Mock;
  const mockedUseMessageQueue = useMessageQueue as Mock;
  const mockedUseApprovalModeIndicator = useApprovalModeIndicator as Mock;
  const mockedUseGitBranchName = useGitBranchName as Mock;
  const mockedUseVimMode = useVimMode as Mock;
  const mockedUseSessionStats = useSessionStats as Mock;
  const mockedUseTextBuffer = useTextBuffer as Mock;
  const mockedUseLogger = useLogger as Mock;
  const mockedUseLoadingIndicator = useLoadingIndicator as Mock;
  const mockedUseSuspend = useSuspend as Mock;
  const mockedUseInputHistoryStore = useInputHistoryStore as Mock;
  const mockedUseHookDisplayState = useHookDisplayState as Mock;
  const mockedUseTerminalTheme = useTerminalTheme as Mock;
  const mockedUseShellInactivityStatus = useShellInactivityStatus as Mock;
  const mockedUseFocusState = useFocus as Mock;

  const DEFAULT_GEMINI_STREAM_MOCK = {
    streamingState: 'idle',
    submitQuery: vi.fn(),
    initError: null,
    pendingHistoryItems: [],
    thought: null,
    cancelOngoingRequest: vi.fn(),
    handleApprovalModeChange: vi.fn(),
    activePtyId: null,
    disableLoopDetectionConfirmationRequest: null,
    backgroundShellCount: 0,
    isBackgroundShellVisible: false,
    toggleBackgroundShell: vi.fn(),
    backgroundCurrentShell: vi.fn(),
    backgroundShells: new Map(),
    registerBackgroundShell: vi.fn(),
    dismissBackgroundShell: vi.fn(),
  };

  beforeEach(() => {
    persistentStateMock.reset();
    vi.clearAllMocks();

    mockIdeClient.getInstance.mockReturnValue(new Promise(() => {}));

    // Initialize mock stdout for terminal title tests

    mocks.mockStdout.write.mockClear();

    capturedUIState = null!;

    // **Provide a default return value for EVERY mocked hook.**
    mockedUseQuotaAndFallback.mockReturnValue({
      proQuotaRequest: null,
      handleProQuotaChoice: vi.fn(),
    });
    mockedUseHistory.mockReturnValue({
      history: [],
      addItem: vi.fn(),
      updateItem: vi.fn(),
      clearItems: vi.fn(),
      loadHistory: vi.fn(),
    });
    mockedUseThemeCommand.mockReturnValue({
      isThemeDialogOpen: false,
      openThemeDialog: vi.fn(),
      handleThemeSelect: vi.fn(),
      handleThemeHighlight: vi.fn(),
    });
    mockedUseAuthCommand.mockReturnValue({
      authState: 'authenticated',
      setAuthState: vi.fn(),
      authError: null,
      onAuthError: vi.fn(),
    });
    mockedUseEditorSettings.mockReturnValue({
      isEditorDialogOpen: false,
      openEditorDialog: vi.fn(),
      handleEditorSelect: vi.fn(),
      exitEditorDialog: vi.fn(),
    });
    mockedUseSettingsCommand.mockReturnValue({
      isSettingsDialogOpen: false,
      openSettingsDialog: vi.fn(),
      closeSettingsDialog: vi.fn(),
    });
    mockedUseModelCommand.mockReturnValue({
      isModelDialogOpen: false,
      openModelDialog: vi.fn(),
      closeModelDialog: vi.fn(),
    });
    mockedUseSlashCommandProcessor.mockReturnValue({
      handleSlashCommand: vi.fn(),
      slashCommands: [],
      pendingHistoryItems: [],
      commandContext: {},
      shellConfirmationRequest: null,
      confirmationRequest: null,
    });
    mockedUseConsoleMessages.mockReturnValue({
      consoleMessages: [],
      handleNewMessage: vi.fn(),
      clearConsoleMessages: vi.fn(),
    });
    mockedUseGeminiStream.mockReturnValue(DEFAULT_GEMINI_STREAM_MOCK);
    mockedUseVim.mockReturnValue({ handleInput: vi.fn() });
    mockedUseFolderTrust.mockReturnValue({
      isFolderTrustDialogOpen: false,
      handleFolderTrustSelect: vi.fn(),
      isRestarting: false,
    });
    mockedUseIdeTrustListener.mockReturnValue({
      needsRestart: false,
      restartReason: 'NONE',
    });
    mockedUseMessageQueue.mockReturnValue({
      messageQueue: [],
      addMessage: vi.fn(),
      clearQueue: vi.fn(),
      getQueuedMessagesText: vi.fn().mockReturnValue(''),
    });
    mockedUseApprovalModeIndicator.mockReturnValue(false);
    mockedUseGitBranchName.mockReturnValue('main');
    mockedUseVimMode.mockReturnValue({
      isVimEnabled: false,
      toggleVimEnabled: vi.fn(),
    });
    mockedUseSessionStats.mockReturnValue({ stats: {} });
    mockedUseTextBuffer.mockReturnValue({
      text: '',
      setText: vi.fn(),
      lines: [''],
      cursor: [0, 0],
      handleInput: vi.fn().mockReturnValue(false),
    });
    mockedUseLogger.mockReturnValue({
      getPreviousUserMessages: vi.fn().mockResolvedValue([]),
    });
    mockedUseInputHistoryStore.mockReturnValue({
      inputHistory: [],
      addInput: vi.fn(),
      initializeFromLogger: vi.fn(),
    });
    mockedUseLoadingIndicator.mockReturnValue({
      elapsedTime: '0.0s',
      currentLoadingPhrase: '',
    });
    mockedUseSuspend.mockReturnValue({
      handleSuspend: vi.fn(),
    });
    mockedUseHookDisplayState.mockReturnValue([]);
    mockedUseTerminalTheme.mockReturnValue(undefined);
    mockedUseShellInactivityStatus.mockReturnValue({
      shouldShowFocusHint: false,
      inactivityStatus: 'none',
    });
    mockedUseFocusState.mockReturnValue({
      isFocused: true,
      hasReceivedFocusEvent: true,
    });

    // Mock Config
    mockConfig = makeFakeConfig();

    // Mock config's getTargetDir to return consistent workspace directory
    vi.spyOn(mockConfig, 'getTargetDir').mockReturnValue('/test/workspace');
    vi.spyOn(mockConfig, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(mockConfig, 'getDebugMode').mockReturnValue(false);

    mockExtensionManager = vi.mockObject({
      getExtensions: vi.fn().mockReturnValue([]),
      setRequestConsent: vi.fn(),
      setRequestSetting: vi.fn(),
      start: vi.fn(),
    } as unknown as ExtensionManager);
    vi.spyOn(mockConfig, 'getExtensionLoader').mockReturnValue(
      mockExtensionManager,
    );

    // Mock LoadedSettings
    const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
    mockSettings = {
      merged: {
        ...defaultMergedSettings,
        ui: {
          ...defaultMergedSettings.ui,
          hideBanner: false,
          hideFooter: false,
          hideTips: false,
          showStatusInTitle: false,
          hideWindowTitle: false,
          useAlternateBuffer: false,
        },
        showMemoryUsage: false,
        theme: 'default',
      },
    } as unknown as LoadedSettings;

    // Mock InitializationResult
    mockInitResult = {
      themeError: null,
      authError: null,
      shouldOpenAuthDialog: false,
      geminiMdFileCount: 0,
    } as InitializationResult;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders without crashing with minimal props', async () => {
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());
      unmount!();
    });

    it('renders with startup warnings', async () => {
      const startupWarnings: StartupWarning[] = [
        {
          id: 'w1',
          message: 'Warning 1',
          priority: WarningPriority.High,
        },
        {
          id: 'w2',
          message: 'Warning 2',
          priority: WarningPriority.High,
        },
      ];

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({ startupWarnings });
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());
      unmount!();
    });

    it('shows full UI details by default', async () => {
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });

      await waitFor(() => {
        expect(capturedUIState.cleanUiDetailsVisible).toBe(true);
      });
      unmount!();
    });

    it('starts in minimal UI mode when Focus UI preference is persisted', async () => {
      persistentStateMock.get.mockReturnValueOnce(true);

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          settings: mockSettings,
        });
        unmount = result.unmount;
      });

      await waitFor(() => {
        expect(capturedUIState.cleanUiDetailsVisible).toBe(false);
      });
      expect(persistentStateMock.get).toHaveBeenCalledWith('focusUiEnabled');
      unmount!();
    });
  });

  describe('State Initialization', () => {
    it('sends a macOS notification when confirmation is pending and terminal is unfocused', async () => {
      mockedUseFocusState.mockReturnValue({
        isFocused: false,
        hasReceivedFocusEvent: true,
      });
      mockedUseGeminiStream.mockReturnValue({
        ...DEFAULT_GEMINI_STREAM_MOCK,
        pendingHistoryItems: [
          {
            type: 'tool_group',
            tools: [
              {
                callId: 'call-1',
                name: 'run_shell_command',
                description: 'Run command',
                resultDisplay: undefined,
                status: CoreToolCallStatus.AwaitingApproval,
                confirmationDetails: {
                  type: 'exec',
                  title: 'Run shell command',
                  command: 'ls',
                  rootCommand: 'ls',
                  rootCommands: ['ls'],
                },
              },
            ],
          },
        ],
      });

      let unmount: (() => void) | undefined;
      await act(async () => {
        const rendered = renderAppContainer();
        unmount = rendered.unmount;
      });

      await waitFor(() =>
        expect(terminalNotificationsMocks.notifyViaTerminal).toHaveBeenCalled(),
      );
      expect(
        terminalNotificationsMocks.buildRunEventNotificationContent,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'attention',
        }),
      );

      await act(async () => {
        unmount?.();
      });
    });

    it('does not send attention notification when terminal is focused', async () => {
      mockedUseFocusState.mockReturnValue({
        isFocused: true,
        hasReceivedFocusEvent: true,
      });
      mockedUseGeminiStream.mockReturnValue({
        ...DEFAULT_GEMINI_STREAM_MOCK,
        pendingHistoryItems: [
          {
            type: 'tool_group',
            tools: [
              {
                callId: 'call-2',
                name: 'run_shell_command',
                description: 'Run command',
                resultDisplay: undefined,
                status: CoreToolCallStatus.AwaitingApproval,
                confirmationDetails: {
                  type: 'exec',
                  title: 'Run shell command',
                  command: 'ls',
                  rootCommand: 'ls',
                  rootCommands: ['ls'],
                },
              },
            ],
          },
        ],
      });

      let unmount: (() => void) | undefined;
      await act(async () => {
        const rendered = renderAppContainer();
        unmount = rendered.unmount;
      });

      expect(
        terminalNotificationsMocks.notifyViaTerminal,
      ).not.toHaveBeenCalled();

      await act(async () => {
        unmount?.();
      });
    });

    it('sends attention notification when focus reporting is unavailable', async () => {
      mockedUseFocusState.mockReturnValue({
        isFocused: true,
        hasReceivedFocusEvent: false,
      });
      mockedUseGeminiStream.mockReturnValue({
        ...DEFAULT_GEMINI_STREAM_MOCK,
        pendingHistoryItems: [
          {
            type: 'tool_group',
            tools: [
              {
                callId: 'call-focus-unknown',
                name: 'run_shell_command',
                description: 'Run command',
                resultDisplay: undefined,
                status: CoreToolCallStatus.AwaitingApproval,
                confirmationDetails: {
                  type: 'exec',
                  title: 'Run shell command',
                  command: 'ls',
                  rootCommand: 'ls',
                  rootCommands: ['ls'],
                },
              },
            ],
          },
        ],
      });

      let unmount: (() => void) | undefined;
      await act(async () => {
        const rendered = renderAppContainer();
        unmount = rendered.unmount;
      });

      await waitFor(() =>
        expect(terminalNotificationsMocks.notifyViaTerminal).toHaveBeenCalled(),
      );

      await act(async () => {
        unmount?.();
      });
    });

    it('sends a macOS notification when a response completes while unfocused', async () => {
      mockedUseFocusState.mockReturnValue({
        isFocused: false,
        hasReceivedFocusEvent: true,
      });
      let currentStreamingState: 'idle' | 'responding' = 'responding';
      mockedUseGeminiStream.mockImplementation(() => ({
        ...DEFAULT_GEMINI_STREAM_MOCK,
        streamingState: currentStreamingState,
      }));

      let unmount: (() => void) | undefined;
      let rerender: ((tree: ReactElement) => void) | undefined;

      await act(async () => {
        const rendered = renderAppContainer();
        unmount = rendered.unmount;
        rerender = rendered.rerender;
      });

      currentStreamingState = 'idle';
      await act(async () => {
        rerender?.(getAppContainer());
      });

      await waitFor(() =>
        expect(
          terminalNotificationsMocks.buildRunEventNotificationContent,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'session_complete',
            detail: 'Gemini CLI finished responding.',
          }),
        ),
      );
      expect(terminalNotificationsMocks.notifyViaTerminal).toHaveBeenCalled();

      await act(async () => {
        unmount?.();
      });
    });

    it('sends completion notification when focus reporting is unavailable', async () => {
      mockedUseFocusState.mockReturnValue({
        isFocused: true,
        hasReceivedFocusEvent: false,
      });
      let currentStreamingState: 'idle' | 'responding' = 'responding';
      mockedUseGeminiStream.mockImplementation(() => ({
        ...DEFAULT_GEMINI_STREAM_MOCK,
        streamingState: currentStreamingState,
      }));

      let unmount: (() => void) | undefined;
      let rerender: ((tree: ReactElement) => void) | undefined;

      await act(async () => {
        const rendered = renderAppContainer();
        unmount = rendered.unmount;
        rerender = rendered.rerender;
      });

      currentStreamingState = 'idle';
      await act(async () => {
        rerender?.(getAppContainer());
      });

      await waitFor(() =>
        expect(
          terminalNotificationsMocks.buildRunEventNotificationContent,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'session_complete',
            detail: 'Gemini CLI finished responding.',
          }),
        ),
      );

      await act(async () => {
        unmount?.();
      });
    });

    it('does not send completion notification when another action-required dialog is pending', async () => {
      mockedUseFocusState.mockReturnValue({
        isFocused: false,
        hasReceivedFocusEvent: true,
      });
      mockedUseQuotaAndFallback.mockReturnValue({
        proQuotaRequest: { kind: 'upgrade' },
        handleProQuotaChoice: vi.fn(),
      });
      let currentStreamingState: 'idle' | 'responding' = 'responding';
      mockedUseGeminiStream.mockImplementation(() => ({
        ...DEFAULT_GEMINI_STREAM_MOCK,
        streamingState: currentStreamingState,
      }));

      let unmount: (() => void) | undefined;
      let rerender: ((tree: ReactElement) => void) | undefined;

      await act(async () => {
        const rendered = renderAppContainer();
        unmount = rendered.unmount;
        rerender = rendered.rerender;
      });

      currentStreamingState = 'idle';
      await act(async () => {
        rerender?.(getAppContainer());
      });

      expect(
        terminalNotificationsMocks.notifyViaTerminal,
      ).not.toHaveBeenCalled();

      await act(async () => {
        unmount?.();
      });
    });

    it('can send repeated attention notifications for the same key after pending state clears', async () => {
      mockedUseFocusState.mockReturnValue({
        isFocused: false,
        hasReceivedFocusEvent: true,
      });

      let pendingHistoryItems = [
        {
          type: 'tool_group',
          tools: [
            {
              callId: 'repeat-key-call',
              name: 'run_shell_command',
              description: 'Run command',
              resultDisplay: undefined,
              status: CoreToolCallStatus.AwaitingApproval,
              confirmationDetails: {
                type: 'exec',
                title: 'Run shell command',
                command: 'ls',
                rootCommand: 'ls',
                rootCommands: ['ls'],
              },
            },
          ],
        },
      ];

      mockedUseGeminiStream.mockImplementation(() => ({
        ...DEFAULT_GEMINI_STREAM_MOCK,
        pendingHistoryItems,
      }));

      let unmount: (() => void) | undefined;
      let rerender: ((tree: ReactElement) => void) | undefined;

      await act(async () => {
        const rendered = renderAppContainer();
        unmount = rendered.unmount;
        rerender = rendered.rerender;
      });

      await waitFor(() =>
        expect(
          terminalNotificationsMocks.notifyViaTerminal,
        ).toHaveBeenCalledTimes(1),
      );

      pendingHistoryItems = [];
      await act(async () => {
        rerender?.(getAppContainer());
      });

      pendingHistoryItems = [
        {
          type: 'tool_group',
          tools: [
            {
              callId: 'repeat-key-call',
              name: 'run_shell_command',
              description: 'Run command',
              resultDisplay: undefined,
              status: CoreToolCallStatus.AwaitingApproval,
              confirmationDetails: {
                type: 'exec',
                title: 'Run shell command',
                command: 'ls',
                rootCommand: 'ls',
                rootCommands: ['ls'],
              },
            },
          ],
        },
      ];
      await act(async () => {
        rerender?.(getAppContainer());
      });

      await waitFor(() =>
        expect(
          terminalNotificationsMocks.notifyViaTerminal,
        ).toHaveBeenCalledTimes(2),
      );

      await act(async () => {
        unmount?.();
      });
    });

    it('initializes with theme error from initialization result', async () => {
      const initResultWithError = {
        ...mockInitResult,
        themeError: 'Failed to load theme',
      };

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          initResult: initResultWithError,
        });
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());
      unmount!();
    });

    it('handles debug mode state', () => {
      const debugConfig = makeFakeConfig();
      vi.spyOn(debugConfig, 'getDebugMode').mockReturnValue(true);

      expect(() => {
        renderAppContainer({ config: debugConfig });
      }).not.toThrow();
    });
  });

  describe('Context Providers', () => {
    it('provides AppContext with correct values', async () => {
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({ version: '2.0.0' });
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());

      // Should render and unmount cleanly
      expect(() => unmount!()).not.toThrow();
    });

    it('provides UIStateContext with state management', async () => {
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());
      unmount!();
    });

    it('provides UIActionsContext with action handlers', async () => {
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());
      unmount!();
    });

    it('provides ConfigContext with config object', async () => {
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());
      unmount!();
    });
  });

  describe('Settings Integration', () => {
    it('handles settings with all display options disabled', async () => {
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const settingsAllHidden = {
        merged: {
          ...defaultMergedSettings,
          hideBanner: true,
          hideFooter: true,
          hideTips: true,
          showMemoryUsage: false,
        },
      } as unknown as LoadedSettings;

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({ settings: settingsAllHidden });
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());
      unmount!();
    });

    it('handles settings with memory usage enabled', async () => {
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const settingsWithMemory = {
        merged: {
          ...defaultMergedSettings,
          hideBanner: false,
          hideFooter: false,
          hideTips: false,
          showMemoryUsage: true,
        },
      } as unknown as LoadedSettings;

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({ settings: settingsWithMemory });
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());
      unmount!();
    });
  });

  describe('Version Handling', () => {
    it.each(['1.0.0', '2.1.3-beta', '3.0.0-nightly'])(
      'handles version format: %s',
      async (version) => {
        let unmount: () => void;
        await act(async () => {
          const result = renderAppContainer({ version });
          unmount = result.unmount;
        });
        await waitFor(() => expect(capturedUIState).toBeTruthy());
        unmount!();
      },
    );
  });

  describe('Error Handling', () => {
    it('handles config methods that might throw', async () => {
      const errorConfig = makeFakeConfig();
      vi.spyOn(errorConfig, 'getModel').mockImplementation(() => {
        throw new Error('Config error');
      });

      // Should still render without crashing - errors should be handled internally
      const { unmount } = renderAppContainer({ config: errorConfig });
      unmount();
    });

    it('handles undefined settings gracefully', async () => {
      const undefinedSettings = {
        merged: mergeSettings({}, {}, {}, {}, true),
      } as LoadedSettings;

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({ settings: undefinedSettings });
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());
      unmount!();
    });
  });

  describe('Provider Hierarchy', () => {
    it('establishes correct provider nesting order', () => {
      // This tests that all the context providers are properly nested
      // and that the component tree can be built without circular dependencies
      const { unmount } = renderAppContainer();

      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Session Resumption', () => {
    it('handles resumed session data correctly', async () => {
      const mockResumedSessionData = {
        conversation: {
          sessionId: 'test-session-123',
          projectHash: 'test-project-hash',
          startTime: '2024-01-01T00:00:00Z',
          lastUpdated: '2024-01-01T00:00:01Z',
          messages: [
            {
              id: 'msg-1',
              type: 'user' as const,
              content: 'Hello',
              timestamp: '2024-01-01T00:00:00Z',
            },
            {
              id: 'msg-2',
              type: 'gemini' as const,
              content: 'Hi there!',
              role: 'model' as const,
              parts: [{ text: 'Hi there!' }],
              timestamp: '2024-01-01T00:00:01Z',
            },
          ],
        },
        filePath: '/tmp/test-session.json',
      };

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          config: mockConfig,
          settings: mockSettings,
          version: '1.0.0',
          initResult: mockInitResult,
          resumedSessionData: mockResumedSessionData,
        });
        unmount = result.unmount;
      });
      await act(async () => {
        unmount();
      });
    });

    it('renders without resumed session data', async () => {
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          config: mockConfig,
          settings: mockSettings,
          version: '1.0.0',
          initResult: mockInitResult,
          resumedSessionData: undefined,
        });
        unmount = result.unmount;
      });
      await act(async () => {
        unmount();
      });
    });

    it('initializes chat recording service when config has it', () => {
      const mockChatRecordingService = {
        initialize: vi.fn(),
        recordMessage: vi.fn(),
        recordMessageTokens: vi.fn(),
        recordToolCalls: vi.fn(),
      };

      const mockGeminiClient = {
        isInitialized: vi.fn(() => true),
        resumeChat: vi.fn(),
        getUserTier: vi.fn(),
        getChatRecordingService: vi.fn(() => mockChatRecordingService),
      };

      const configWithRecording = makeFakeConfig();
      vi.spyOn(configWithRecording, 'getGeminiClient').mockReturnValue(
        mockGeminiClient as unknown as ReturnType<Config['getGeminiClient']>,
      );

      expect(() => {
        renderAppContainer({
          config: configWithRecording,
          settings: mockSettings,
          version: '1.0.0',
          initResult: mockInitResult,
        });
      }).not.toThrow();
    });
  });
  describe('Session Recording Integration', () => {
    it('provides chat recording service configuration', () => {
      const mockChatRecordingService = {
        initialize: vi.fn(),
        recordMessage: vi.fn(),
        recordMessageTokens: vi.fn(),
        recordToolCalls: vi.fn(),
        getSessionId: vi.fn(() => 'test-session-123'),
        getCurrentConversation: vi.fn(),
      };

      const mockGeminiClient = {
        isInitialized: vi.fn(() => true),
        resumeChat: vi.fn(),
        getUserTier: vi.fn(),
        getChatRecordingService: vi.fn(() => mockChatRecordingService),
        setHistory: vi.fn(),
      };

      const configWithRecording = makeFakeConfig();
      vi.spyOn(configWithRecording, 'getGeminiClient').mockReturnValue(
        mockGeminiClient as unknown as ReturnType<Config['getGeminiClient']>,
      );
      vi.spyOn(configWithRecording, 'getSessionId').mockReturnValue(
        'test-session-123',
      );

      expect(() => {
        renderAppContainer({
          config: configWithRecording,
          settings: mockSettings,
          version: '1.0.0',
          initResult: mockInitResult,
        });
      }).not.toThrow();

      // Verify the recording service structure is correct
      expect(configWithRecording.getGeminiClient).toBeDefined();
      expect(mockGeminiClient.getChatRecordingService).toBeDefined();
      expect(mockChatRecordingService.initialize).toBeDefined();
      expect(mockChatRecordingService.recordMessage).toBeDefined();
    });

    it('handles session recording when messages are added', () => {
      const mockRecordMessage = vi.fn();
      const mockRecordMessageTokens = vi.fn();

      const mockChatRecordingService = {
        initialize: vi.fn(),
        recordMessage: mockRecordMessage,
        recordMessageTokens: mockRecordMessageTokens,
        recordToolCalls: vi.fn(),
        getSessionId: vi.fn(() => 'test-session-123'),
      };

      const mockGeminiClient = {
        isInitialized: vi.fn(() => true),
        getChatRecordingService: vi.fn(() => mockChatRecordingService),
        getUserTier: vi.fn(),
      };

      const configWithRecording = makeFakeConfig();
      vi.spyOn(configWithRecording, 'getGeminiClient').mockReturnValue(
        mockGeminiClient as unknown as ReturnType<Config['getGeminiClient']>,
      );

      renderAppContainer({
        config: configWithRecording,
        settings: mockSettings,
        version: '1.0.0',
        initResult: mockInitResult,
      });

      // The actual recording happens through the useHistory hook
      // which would be triggered by user interactions
      expect(mockChatRecordingService.initialize).toBeDefined();
      expect(mockChatRecordingService.recordMessage).toBeDefined();
    });
  });

  describe('Session Resume Flow', () => {
    it('accepts resumed session data', () => {
      const mockResumeChat = vi.fn();
      const mockGeminiClient = {
        isInitialized: vi.fn(() => true),
        resumeChat: mockResumeChat,
        getUserTier: vi.fn(),
        getChatRecordingService: vi.fn(() => ({
          initialize: vi.fn(),
          recordMessage: vi.fn(),
          recordMessageTokens: vi.fn(),
          recordToolCalls: vi.fn(),
        })),
      };

      const configWithClient = makeFakeConfig();
      vi.spyOn(configWithClient, 'getGeminiClient').mockReturnValue(
        mockGeminiClient as unknown as ReturnType<Config['getGeminiClient']>,
      );

      const resumedData = {
        conversation: {
          sessionId: 'resumed-session-456',
          projectHash: 'project-hash',
          startTime: '2024-01-01T00:00:00Z',
          lastUpdated: '2024-01-01T00:01:00Z',
          messages: [
            {
              id: 'msg-1',
              type: 'user' as const,
              content: 'Previous question',
              timestamp: '2024-01-01T00:00:00Z',
            },
            {
              id: 'msg-2',
              type: 'gemini' as const,
              content: 'Previous answer',
              role: 'model' as const,
              parts: [{ text: 'Previous answer' }],
              timestamp: '2024-01-01T00:00:30Z',
              tokenCount: { input: 10, output: 20 },
            },
          ],
        },
        filePath: '/tmp/resumed-session.json',
      };

      expect(() => {
        renderAppContainer({
          config: configWithClient,
          settings: mockSettings,
          version: '1.0.0',
          initResult: mockInitResult,
          resumedSessionData: resumedData,
        });
      }).not.toThrow();

      // Verify the resume functionality structure is in place
      expect(mockGeminiClient.resumeChat).toBeDefined();
      expect(resumedData.conversation.messages).toHaveLength(2);
    });

    it('does not attempt resume when client is not initialized', () => {
      const mockResumeChat = vi.fn();
      const mockGeminiClient = {
        isInitialized: vi.fn(() => false), // Not initialized
        resumeChat: mockResumeChat,
        getUserTier: vi.fn(),
        getChatRecordingService: vi.fn(),
      };

      const configWithClient = makeFakeConfig();
      vi.spyOn(configWithClient, 'getGeminiClient').mockReturnValue(
        mockGeminiClient as unknown as ReturnType<Config['getGeminiClient']>,
      );

      const resumedData = {
        conversation: {
          sessionId: 'test-session',
          projectHash: 'project-hash',
          startTime: '2024-01-01T00:00:00Z',
          lastUpdated: '2024-01-01T00:01:00Z',
          messages: [],
        },
        filePath: '/tmp/session.json',
      };

      renderAppContainer({
        config: configWithClient,
        settings: mockSettings,
        version: '1.0.0',
        initResult: mockInitResult,
        resumedSessionData: resumedData,
      });

      // Should not call resumeChat when client is not initialized
      expect(mockResumeChat).not.toHaveBeenCalled();
    });
  });

  describe('Token Counting from Session Stats', () => {
    it('tracks token counts from session messages', () => {
      // Session stats are provided through the SessionStatsProvider context
      // in the real app, not through the config directly
      const mockChatRecordingService = {
        initialize: vi.fn(),
        recordMessage: vi.fn(),
        recordMessageTokens: vi.fn(),
        recordToolCalls: vi.fn(),
        getSessionId: vi.fn(() => 'test-session-123'),
        getCurrentConversation: vi.fn(() => ({
          sessionId: 'test-session-123',
          messages: [],
          totalInputTokens: 150,
          totalOutputTokens: 350,
        })),
      };

      const mockGeminiClient = {
        isInitialized: vi.fn(() => true),
        getChatRecordingService: vi.fn(() => mockChatRecordingService),
        getUserTier: vi.fn(),
      };

      const configWithRecording = makeFakeConfig();
      vi.spyOn(configWithRecording, 'getGeminiClient').mockReturnValue(
        mockGeminiClient as unknown as ReturnType<Config['getGeminiClient']>,
      );

      renderAppContainer({
        config: configWithRecording,
        settings: mockSettings,
        version: '1.0.0',
        initResult: mockInitResult,
      });

      // In the actual app, these stats would be displayed in components
      // and updated as messages are processed through the recording service
      expect(mockChatRecordingService.recordMessageTokens).toBeDefined();
      expect(mockChatRecordingService.getCurrentConversation).toBeDefined();
    });
  });

  describe('Quota and Fallback Integration', () => {
    it('passes a null proQuotaRequest to UIStateContext by default', async () => {
      // The default mock from beforeEach already sets proQuotaRequest to null
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => {
        // Assert that the context value is as expected
        expect(capturedUIState.quota.proQuotaRequest).toBeNull();
      });
      unmount!();
    });

    it('passes a valid proQuotaRequest to UIStateContext when provided by the hook', async () => {
      // Arrange: Create a mock request object that a UI dialog would receive
      const mockRequest = {
        failedModel: 'gemini-pro',
        fallbackModel: 'gemini-flash',
        resolve: vi.fn(),
      };
      mockedUseQuotaAndFallback.mockReturnValue({
        proQuotaRequest: mockRequest,
        handleProQuotaChoice: vi.fn(),
      });

      // Act: Render the container
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => {
        // Assert: The mock request is correctly passed through the context
        expect(capturedUIState.quota.proQuotaRequest).toEqual(mockRequest);
      });
      unmount!();
    });

    it('passes the handleProQuotaChoice function to UIActionsContext', async () => {
      // Arrange: Create a mock handler function
      const mockHandler = vi.fn();
      mockedUseQuotaAndFallback.mockReturnValue({
        proQuotaRequest: null,
        handleProQuotaChoice: mockHandler,
      });

      // Act: Render the container
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => {
        // Assert: The action in the context is the mock handler we provided
        expect(capturedUIActions.handleProQuotaChoice).toBe(mockHandler);
      });

      // You can even verify that the plumbed function is callable
      act(() => {
        capturedUIActions.handleProQuotaChoice('retry_later');
      });
      expect(mockHandler).toHaveBeenCalledWith('retry_later');
      unmount!();
    });
  });

  describe('Terminal Title Update Feature', () => {
    beforeEach(() => {
      // Reset mock stdout for each test
      mocks.mockStdout.write.mockClear();
    });

    it('verifies useStdout is mocked', async () => {
      const { useStdout } = await import('ink');
      const { stdout } = useStdout();
      expect(stdout).toBe(mocks.mockStdout);
    });

    it('should update terminal title with Working… when showStatusInTitle is false', async () => {
      // Arrange: Set up mock settings with showStatusInTitle disabled
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const mockSettingsWithShowStatusFalse = {
        ...mockSettings,
        merged: {
          ...defaultMergedSettings,
          ui: {
            ...defaultMergedSettings.ui,
            showStatusInTitle: false,
            hideWindowTitle: false,
          },
        },
      } as unknown as LoadedSettings;

      // Mock the streaming state as Active
      mockedUseGeminiStream.mockReturnValue({
        ...DEFAULT_GEMINI_STREAM_MOCK,
        streamingState: 'responding',
        thought: { subject: 'Some thought' },
      });

      // Act: Render the container
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          settings: mockSettingsWithShowStatusFalse,
        });
        unmount = result.unmount;
      });

      // Assert: Check that title was updated with "Working…"
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]0;${'✦  Working… (workspace)'.padEnd(80, ' ')}\x07`,
      );
      unmount!();
    });

    it('should use legacy terminal title when dynamicWindowTitle is false', async () => {
      // Arrange: Set up mock settings with dynamicWindowTitle disabled
      const mockSettingsWithDynamicTitleFalse = {
        ...mockSettings,
        merged: {
          ...mockSettings.merged,
          ui: {
            ...mockSettings.merged.ui,
            dynamicWindowTitle: false,
            hideWindowTitle: false,
          },
        },
      } as unknown as LoadedSettings;

      // Mock the streaming state
      mockedUseGeminiStream.mockReturnValue({
        ...DEFAULT_GEMINI_STREAM_MOCK,
        streamingState: 'responding',
        thought: { subject: 'Some thought' },
      });

      // Act: Render the container
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          settings: mockSettingsWithDynamicTitleFalse,
        });
        unmount = result.unmount;
      });

      // Assert: Check that legacy title was used
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]0;${'Gemini CLI (workspace)'.padEnd(80, ' ')}\x07`,
      );
      unmount!();
    });

    it('should not update terminal title when hideWindowTitle is true', async () => {
      // Arrange: Set up mock settings with hideWindowTitle enabled
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const mockSettingsWithTitleFalse = {
        ...mockSettings,
        merged: {
          ...defaultMergedSettings,
          ui: {
            ...defaultMergedSettings.ui,
            showStatusInTitle: true,
            hideWindowTitle: true,
          },
        },
      } as unknown as LoadedSettings;

      // Act: Render the container
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          settings: mockSettingsWithTitleFalse,
        });
        unmount = result.unmount;
      });

      // Assert: Check that no title-related writes occurred
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites.filter((c) => c[0].includes('\x1b]0;'))).toHaveLength(
        0,
      );
      unmount!();
    });

    it('should update terminal title with thought subject when in active state', async () => {
      // Arrange: Set up mock settings with showStatusInTitle enabled
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const mockSettingsWithTitleEnabled = {
        ...mockSettings,
        merged: {
          ...defaultMergedSettings,
          ui: {
            ...defaultMergedSettings.ui,
            showStatusInTitle: true,
            hideWindowTitle: false,
          },
        },
      } as unknown as LoadedSettings;

      // Mock the streaming state and thought
      const thoughtSubject = 'Processing request';
      mockedUseGeminiStream.mockReturnValue({
        ...DEFAULT_GEMINI_STREAM_MOCK,
        streamingState: 'responding',
        thought: { subject: thoughtSubject },
      });

      // Act: Render the container
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          settings: mockSettingsWithTitleEnabled,
        });
        unmount = result.unmount;
      });

      // Assert: Check that title was updated with thought subject and suffix
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]0;${`✦  ${thoughtSubject} (workspace)`.padEnd(80, ' ')}\x07`,
      );
      unmount!();
    });

    it('should update terminal title with default text when in Idle state and no thought subject', async () => {
      // Arrange: Set up mock settings with showStatusInTitle enabled
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const mockSettingsWithTitleEnabled = {
        ...mockSettings,
        merged: {
          ...defaultMergedSettings,
          ui: {
            ...defaultMergedSettings.ui,
            showStatusInTitle: true,
            hideWindowTitle: false,
          },
        },
      } as unknown as LoadedSettings;

      // Mock the streaming state as Idle with no thought
      mockedUseGeminiStream.mockReturnValue(DEFAULT_GEMINI_STREAM_MOCK);

      // Act: Render the container
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          settings: mockSettingsWithTitleEnabled,
        });
        unmount = result.unmount;
      });

      // Assert: Check that title was updated with default Idle text
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]0;${'◇  Ready (workspace)'.padEnd(80, ' ')}\x07`,
      );
      unmount!();
    });

    it('should update terminal title when in WaitingForConfirmation state with thought subject', async () => {
      // Arrange: Set up mock settings with showStatusInTitle enabled
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const mockSettingsWithTitleEnabled = {
        ...mockSettings,
        merged: {
          ...defaultMergedSettings,
          ui: {
            ...defaultMergedSettings.ui,
            showStatusInTitle: true,
            hideWindowTitle: false,
          },
        },
      } as unknown as LoadedSettings;

      // Mock the streaming state and thought
      const thoughtSubject = 'Confirm tool execution';
      mockedUseGeminiStream.mockReturnValue({
        ...DEFAULT_GEMINI_STREAM_MOCK,
        streamingState: 'waiting_for_confirmation',
        thought: { subject: thoughtSubject },
      });

      // Act: Render the container
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          settings: mockSettingsWithTitleEnabled,
        });
        unmount = result.unmount;
      });

      // Assert: Check that title was updated with confirmation text
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]0;${'✋  Action Required (workspace)'.padEnd(80, ' ')}\x07`,
      );
      unmount!();
    });

    describe('Shell Focus Action Required', () => {
      beforeEach(async () => {
        vi.useFakeTimers();
        // Use real implementation for these tests to verify title updates
        const actual = await vi.importActual<
          typeof import('./hooks/useShellInactivityStatus.js')
        >('./hooks/useShellInactivityStatus.js');
        mockedUseShellInactivityStatus.mockImplementation(
          actual.useShellInactivityStatus,
        );
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should show Action Required in title after a delay when shell is awaiting focus', async () => {
        const startTime = 1000000;
        vi.setSystemTime(startTime);

        // Arrange: Set up mock settings with showStatusInTitle enabled
        const mockSettingsWithTitleEnabled = {
          ...mockSettings,
          merged: {
            ...mockSettings.merged,
            ui: {
              ...mockSettings.merged.ui,
              showStatusInTitle: true,
              hideWindowTitle: false,
            },
          },
        } as unknown as LoadedSettings;

        // Mock an active shell pty but not focused
        mockedUseGeminiStream.mockReturnValue({
          ...DEFAULT_GEMINI_STREAM_MOCK,
          streamingState: 'responding',
          thought: { subject: 'Executing shell command' },
          pendingToolCalls: [],
          activePtyId: 'pty-1',
          lastOutputTime: startTime + 100, // Trigger aggressive delay
          retryStatus: null,
        });

        vi.spyOn(mockConfig, 'isInteractive').mockReturnValue(true);
        vi.spyOn(mockConfig, 'isInteractiveShellEnabled').mockReturnValue(true);

        // Act: Render the container (embeddedShellFocused is false by default in state)
        let unmount: () => void;
        await act(async () => {
          const result = renderAppContainer({
            settings: mockSettingsWithTitleEnabled,
          });
          unmount = result.unmount;
        });

        // Initially it should show the working status
        const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
          call[0].includes('\x1b]0;'),
        );
        expect(titleWrites[titleWrites.length - 1][0]).toContain(
          '✦  Executing shell command',
        );

        // Fast-forward time by 40 seconds
        await act(async () => {
          await vi.advanceTimersByTimeAsync(40000);
        });

        // Now it should show Action Required
        const titleWritesDelayed = mocks.mockStdout.write.mock.calls.filter(
          (call) => call[0].includes('\x1b]0;'),
        );
        const lastTitle = titleWritesDelayed[titleWritesDelayed.length - 1][0];
        expect(lastTitle).toContain('✋  Action Required');

        unmount!();
      });

      it('should show Working… in title for redirected commands after 2 mins', async () => {
        const startTime = 1000000;
        vi.setSystemTime(startTime);

        // Arrange: Set up mock settings with showStatusInTitle enabled
        const mockSettingsWithTitleEnabled = {
          ...mockSettings,
          merged: {
            ...mockSettings.merged,
            ui: {
              ...mockSettings.merged.ui,
              showStatusInTitle: true,
              hideWindowTitle: false,
            },
          },
        } as unknown as LoadedSettings;

        // Mock an active shell pty with redirection active
        mockedUseGeminiStream.mockReturnValue({
          ...DEFAULT_GEMINI_STREAM_MOCK,
          streamingState: 'responding',
          thought: { subject: 'Executing shell command' },
          pendingToolCalls: [
            {
              request: {
                name: 'run_shell_command',
                args: { command: 'ls > out' },
              },
              status: CoreToolCallStatus.Executing,
            } as unknown as TrackedToolCall,
          ],
          activePtyId: 'pty-1',
          lastOutputTime: startTime,
          retryStatus: null,
        });

        vi.spyOn(mockConfig, 'isInteractive').mockReturnValue(true);
        vi.spyOn(mockConfig, 'isInteractiveShellEnabled').mockReturnValue(true);

        let unmount: () => void;
        await act(async () => {
          const result = renderAppContainer({
            settings: mockSettingsWithTitleEnabled,
          });
          unmount = result.unmount;
        });

        // Fast-forward time by 65 seconds - should still NOT be Action Required
        await act(async () => {
          await vi.advanceTimersByTimeAsync(65000);
        });

        const titleWritesMid = mocks.mockStdout.write.mock.calls.filter(
          (call) => call[0].includes('\x1b]0;'),
        );
        expect(titleWritesMid[titleWritesMid.length - 1][0]).not.toContain(
          '✋  Action Required',
        );

        // Fast-forward to 2 minutes (120000ms)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(60000);
        });

        const titleWritesEnd = mocks.mockStdout.write.mock.calls.filter(
          (call) => call[0].includes('\x1b]0;'),
        );
        expect(titleWritesEnd[titleWritesEnd.length - 1][0]).toContain(
          '⏲  Working…',
        );

        unmount!();
      });

      it('should show Working… in title for silent non-redirected commands after 1 min', async () => {
        const startTime = 1000000;
        vi.setSystemTime(startTime);

        // Arrange: Set up mock settings with showStatusInTitle enabled
        const mockSettingsWithTitleEnabled = {
          ...mockSettings,
          merged: {
            ...mockSettings.merged,
            ui: {
              ...mockSettings.merged.ui,
              showStatusInTitle: true,
              hideWindowTitle: false,
            },
          },
        } as unknown as LoadedSettings;

        // Mock an active shell pty with NO output since operation started (silent)
        mockedUseGeminiStream.mockReturnValue({
          ...DEFAULT_GEMINI_STREAM_MOCK,
          streamingState: 'responding',
          thought: { subject: 'Executing shell command' },
          pendingToolCalls: [],
          activePtyId: 'pty-1',
          lastOutputTime: startTime, // lastOutputTime <= operationStartTime
          retryStatus: null,
        });

        vi.spyOn(mockConfig, 'isInteractive').mockReturnValue(true);
        vi.spyOn(mockConfig, 'isInteractiveShellEnabled').mockReturnValue(true);

        let unmount: () => void;
        await act(async () => {
          const result = renderAppContainer({
            settings: mockSettingsWithTitleEnabled,
          });
          unmount = result.unmount;
        });

        // Fast-forward time by 65 seconds
        await act(async () => {
          await vi.advanceTimersByTimeAsync(65000);
        });

        const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
          call[0].includes('\x1b]0;'),
        );
        const lastTitle = titleWrites[titleWrites.length - 1][0];
        // Should show Working… (⏲) instead of Action Required (✋)
        expect(lastTitle).toContain('⏲  Working…');

        unmount!();
      });

      it('should NOT show Action Required in title if shell is streaming output', async () => {
        const startTime = 1000000;
        vi.setSystemTime(startTime);

        // Arrange: Set up mock settings with showStatusInTitle enabled
        const mockSettingsWithTitleEnabled = {
          ...mockSettings,
          merged: {
            ...mockSettings.merged,
            ui: {
              ...mockSettings.merged.ui,
              showStatusInTitle: true,
              hideWindowTitle: false,
            },
          },
        } as unknown as LoadedSettings;

        // Mock an active shell pty but not focused
        let lastOutputTime = startTime + 1000;
        mockedUseGeminiStream.mockImplementation(() => ({
          ...DEFAULT_GEMINI_STREAM_MOCK,
          streamingState: 'responding',
          thought: { subject: 'Executing shell command' },
          activePtyId: 'pty-1',
          lastOutputTime,
        }));

        vi.spyOn(mockConfig, 'isInteractive').mockReturnValue(true);
        vi.spyOn(mockConfig, 'isInteractiveShellEnabled').mockReturnValue(true);

        // Act: Render the container
        let unmount: () => void;
        let rerender: (tree: ReactElement) => void;
        await act(async () => {
          const result = renderAppContainer({
            settings: mockSettingsWithTitleEnabled,
          });
          unmount = result.unmount;
          rerender = result.rerender;
        });

        // Fast-forward time by 20 seconds
        await act(async () => {
          await vi.advanceTimersByTimeAsync(20000);
        });

        // Update lastOutputTime to simulate new output
        lastOutputTime = startTime + 21000;
        mockedUseGeminiStream.mockImplementation(() => ({
          ...DEFAULT_GEMINI_STREAM_MOCK,
          streamingState: 'responding',
          thought: { subject: 'Executing shell command' },
          activePtyId: 'pty-1',
          lastOutputTime,
        }));

        // Rerender to propagate the new lastOutputTime
        await act(async () => {
          rerender(getAppContainer({ settings: mockSettingsWithTitleEnabled }));
        });

        // Fast-forward time by another 20 seconds
        // Total time elapsed: 40s.
        // Time since last output: 20s.
        // It should NOT show Action Required yet.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(20000);
        });

        const titleWritesAfterOutput = mocks.mockStdout.write.mock.calls.filter(
          (call) => call[0].includes('\x1b]0;'),
        );
        const lastTitle =
          titleWritesAfterOutput[titleWritesAfterOutput.length - 1][0];
        expect(lastTitle).not.toContain('✋  Action Required');
        expect(lastTitle).toContain('✦  Executing shell command');

        // Fast-forward another 40 seconds (Total 60s since last output)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(40000);
        });

        // Now it SHOULD show Action Required
        const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
          call[0].includes('\x1b]0;'),
        );
        const lastTitleFinal = titleWrites[titleWrites.length - 1][0];
        expect(lastTitleFinal).toContain('✋  Action Required');

        unmount!();
      });
    });

    it('should pad title to exactly 80 characters', async () => {
      // Arrange: Set up mock settings with showStatusInTitle enabled
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const mockSettingsWithTitleEnabled = {
        ...mockSettings,
        merged: {
          ...defaultMergedSettings,
          ui: {
            ...defaultMergedSettings.ui,
            showStatusInTitle: true,
            hideWindowTitle: false,
          },
        },
      } as unknown as LoadedSettings;

      // Mock a short title
      const shortTitle = 'CCCCC';
      vi.spyOn(mockConfig, 'getTargetDir').mockReturnValue(shortTitle);

      // Act: Render the container
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          settings: mockSettingsWithTitleEnabled,
        });
        unmount = result.unmount;
      });

      // Assert: Check padding
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      const calledWith = titleWrites[0][0];
      const expectedTitle = `◇  Ready (${shortTitle})`.padEnd(80, ' ');
      expect(calledWith).toBe(`\x1b]0;${expectedTitle}\x07`);
      unmount!();
    });

    it('should truncate and ellipse folder name if too long for 80 chars', async () => {
      // Arrange
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const mockSettingsWithTitleEnabled = {
        ...mockSettings,
        merged: {
          ...defaultMergedSettings,
          ui: {
            ...defaultMergedSettings.ui,
            showStatusInTitle: true,
            hideWindowTitle: false,
          },
        },
      } as unknown as LoadedSettings;

      const longFolderName = 'A'.repeat(100);
      vi.spyOn(mockConfig, 'getTargetDir').mockReturnValue(longFolderName);

      // Act
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({
          settings: mockSettingsWithTitleEnabled,
        });
        unmount = result.unmount;
      });

      // Assert
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      const calledWith = titleWrites[0][0];
      // Title prefix is "◇  Ready (" (10 chars)
      // Title suffix is ")" (1 char)
      // Total prefix/suffix = 11
      // 80 - 11 = 69 chars available for folder name
      // So it should show 68 chars of folder name + "…"
      const expectedTruncatedFolder = `${'A'.repeat(68)}…`;
      const expectedTitle = `◇  Ready (${expectedTruncatedFolder})`;
      expect(calledWith).toBe(`\x1b]0;${expectedTitle}\x07`);
      unmount!();
    });
  });

  describe('Clean UI Integration', () => {
    it('sets allowPlanMode based on experimental.plan setting', async () => {
      vi.spyOn(mockConfig, 'isPlanEnabled').mockReturnValue(true);
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const mockSettingsWithPlan = {
        merged: {
          ...defaultMergedSettings,
          experimental: {
            ...defaultMergedSettings.experimental,
            plan: true,
          },
        },
      } as unknown as LoadedSettings;

      let unmount: (() => void) | undefined;
      await act(async () => {
        const result = renderAppContainer({
          settings: mockSettingsWithPlan,
        });
        unmount = result.unmount;
      });

      await waitFor(() => {
        expect(capturedUIState).toBeTruthy();
        expect(capturedUIState.allowPlanMode).toBe(true);
      });
      unmount!();
    });

    it('sets allowPlanMode to false when experimental.plan is disabled', async () => {
      vi.spyOn(mockConfig, 'isPlanEnabled').mockReturnValue(false);
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const mockSettingsWithoutPlan = {
        merged: {
          ...defaultMergedSettings,
          experimental: {
            ...defaultMergedSettings.experimental,
            plan: false,
          },
        },
      } as unknown as LoadedSettings;

      let unmount: (() => void) | undefined;
      await act(async () => {
        const result = renderAppContainer({
          settings: mockSettingsWithoutPlan,
        });
        unmount = result.unmount;
      });

      await waitFor(() => {
        expect(capturedUIState).toBeTruthy();
        expect(capturedUIState.allowPlanMode).toBe(false);
      });
      unmount!();
    });
  });
});
