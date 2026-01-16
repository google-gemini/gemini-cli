/**
 * @license
 * Copyright 2025 Google LLC
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
import { render } from '../test-utils/render.js';
import { waitFor } from '../test-utils/async.js';
import { cleanup } from 'ink-testing-library';
import { act, useContext, type ReactElement } from 'react';
import { AppContainer } from './AppContainer.js';
import { SettingsContext } from './contexts/SettingsContext.js';
import {
  type Config,
  makeFakeConfig,
  CoreEvent,
  type UserFeedbackPayload,
  type ResumedSessionData,
  AuthType,
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
import ansiEscapes from 'ansi-escapes';
import { type LoadedSettings, mergeSettings } from '../config/settings.js';
import type { InitializationResult } from '../core/initializer.js';
import { useQuotaAndFallback } from './hooks/useQuotaAndFallback.js';
import { UIStateContext, type UIState } from './contexts/UIStateContext.js';
import {
  UIActionsContext,
  type UIActions,
} from './contexts/UIActionsContext.js';

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
vi.mock('./hooks/useKeypress.js');
vi.mock('./hooks/useLoadingIndicator.js');
vi.mock('./hooks/useFolderTrust.js');
vi.mock('./hooks/useIdeTrustListener.js');
vi.mock('./hooks/useMessageQueue.js');
vi.mock('./hooks/useAutoAcceptIndicator.js');
vi.mock('./hooks/useGitBranchName.js');
vi.mock('./contexts/VimModeContext.js');
vi.mock('./contexts/SessionContext.js');
vi.mock('./components/shared/text-buffer.js');
vi.mock('./hooks/useLogger.js');
vi.mock('./hooks/useInputHistoryStore.js');
vi.mock('./hooks/useHookDisplayState.js');

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
import { useAutoAcceptIndicator } from './hooks/useAutoAcceptIndicator.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import { useVimMode } from './contexts/VimModeContext.js';
import { useSessionStats } from './contexts/SessionContext.js';
import { useTextBuffer } from './components/shared/text-buffer.js';
import { useLogger } from './hooks/useLogger.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useInputHistoryStore } from './hooks/useInputHistoryStore.js';
import { useHookDisplayState } from './hooks/useHookDisplayState.js';
import { useKeypress, type Key } from './hooks/useKeypress.js';
import { measureElement } from 'ink';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import {
  ShellExecutionService,
  writeToStdout,
  enableMouseEvents,
  disableMouseEvents,
} from '@google/gemini-cli-core';
import { type ExtensionManager } from '../config/extension-manager.js';

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
    startupWarnings?: string[];
    resumedSessionData?: ResumedSessionData;
  } = {}) => (
    <SettingsContext.Provider value={settings}>
      <AppContainer
        config={config}
        version={version}
        initializationResult={initResult}
        startupWarnings={startupWarnings}
        resumedSessionData={resumedSessionData}
      />
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
  const mockedUseAutoAcceptIndicator = useAutoAcceptIndicator as Mock;
  const mockedUseGitBranchName = useGitBranchName as Mock;
  const mockedUseVimMode = useVimMode as Mock;
  const mockedUseSessionStats = useSessionStats as Mock;
  const mockedUseTextBuffer = useTextBuffer as Mock;
  const mockedUseLogger = useLogger as Mock;
  const mockedUseLoadingIndicator = useLoadingIndicator as Mock;
  const mockedUseKeypress = useKeypress as Mock;
  const mockedUseInputHistoryStore = useInputHistoryStore as Mock;
  const mockedUseHookDisplayState = useHookDisplayState as Mock;

  beforeEach(() => {
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
    mockedUseGeminiStream.mockReturnValue({
      streamingState: 'idle',
      submitQuery: vi.fn(),
      initError: null,
      pendingHistoryItems: [],
      thought: null,
      cancelOngoingRequest: vi.fn(),
    });
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
    mockedUseAutoAcceptIndicator.mockReturnValue(false);
    mockedUseGitBranchName.mockReturnValue('main');
    mockedUseVimMode.mockReturnValue({
      isVimEnabled: false,
      toggleVimEnabled: vi.fn(),
    });
    mockedUseSessionStats.mockReturnValue({ stats: {} });
    mockedUseTextBuffer.mockReturnValue({
      text: '',
      setText: vi.fn(),
      // Add other properties if AppContainer uses them
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
    mockedUseHookDisplayState.mockReturnValue([]);

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
        hideBanner: false,
        hideFooter: false,
        hideTips: false,
        showMemoryUsage: false,
        theme: 'default',
        ui: {
          ...defaultMergedSettings.ui,
          showStatusInTitle: false,
          hideWindowTitle: false,
        },
        useAlternateBuffer: false,
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
      const startupWarnings = ['Warning 1', 'Warning 2'];

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer({ startupWarnings });
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());
      unmount!();
    });
  });

  describe('State Initialization', () => {
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

      const configWithRecording = {
        ...mockConfig,
        getGeminiClient: vi.fn(() => mockGeminiClient),
      } as unknown as Config;

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

      const configWithRecording = {
        ...mockConfig,
        getGeminiClient: vi.fn(() => mockGeminiClient),
        getSessionId: vi.fn(() => 'test-session-123'),
      } as unknown as Config;

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

      const configWithRecording = {
        ...mockConfig,
        getGeminiClient: vi.fn(() => mockGeminiClient),
      } as unknown as Config;

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

      const configWithClient = {
        ...mockConfig,
        getGeminiClient: vi.fn(() => mockGeminiClient),
      } as unknown as Config;

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

      const configWithClient = {
        ...mockConfig,
        getGeminiClient: vi.fn(() => mockGeminiClient),
      } as unknown as Config;

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

      const configWithRecording = {
        ...mockConfig,
        getGeminiClient: vi.fn(() => mockGeminiClient),
      } as unknown as Config;

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
        expect(capturedUIState.proQuotaRequest).toBeNull();
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
        expect(capturedUIState.proQuotaRequest).toEqual(mockRequest);
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

    it('should update terminal title with Working… when showStatusInTitle is false', () => {
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
        streamingState: 'responding',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: { subject: 'Some thought' },
        cancelOngoingRequest: vi.fn(),
      });

      // Act: Render the container
      const { unmount } = renderAppContainer({
        settings: mockSettingsWithShowStatusFalse,
      });

      // Assert: Check that title was updated with "Working…"
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]0;${'✦  Working… (workspace)'.padEnd(80, ' ')}\x07`,
      );
      unmount();
    });

    it('should use legacy terminal title when dynamicWindowTitle is false', () => {
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
        streamingState: 'responding',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: { subject: 'Some thought' },
        cancelOngoingRequest: vi.fn(),
      });

      // Act: Render the container
      const { unmount } = renderAppContainer({
        settings: mockSettingsWithDynamicTitleFalse,
      });

      // Assert: Check that legacy title was used
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]0;${'Gemini CLI (workspace)'.padEnd(80, ' ')}\x07`,
      );
      unmount();
    });

    it('should not update terminal title when hideWindowTitle is true', () => {
      // Arrange: Set up mock settings with hideWindowTitle enabled
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const mockSettingsWithHideTitleTrue = {
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
      const { unmount } = renderAppContainer({
        settings: mockSettingsWithHideTitleTrue,
      });

      // Assert: Check that no title-related writes occurred
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(0);
      unmount();
    });

    it('should update terminal title with thought subject when in active state', () => {
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
        streamingState: 'responding',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: { subject: thoughtSubject },
        cancelOngoingRequest: vi.fn(),
      });

      // Act: Render the container
      const { unmount } = renderAppContainer({
        settings: mockSettingsWithTitleEnabled,
      });

      // Assert: Check that title was updated with thought subject and suffix
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]0;${`✦  ${thoughtSubject} (workspace)`.padEnd(80, ' ')}\x07`,
      );
      unmount();
    });

    it('should update terminal title with default text when in Idle state and no thought subject', () => {
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
      mockedUseGeminiStream.mockReturnValue({
        streamingState: 'idle',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: vi.fn(),
      });

      // Act: Render the container
      const { unmount } = renderAppContainer({
        settings: mockSettingsWithTitleEnabled,
      });

      // Assert: Check that title was updated with default Idle text
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]0;${'◇  Ready (workspace)'.padEnd(80, ' ')}\x07`,
      );
      unmount();
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
        streamingState: 'waiting_for_confirmation',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: { subject: thoughtSubject },
        cancelOngoingRequest: vi.fn(),
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
      beforeEach(() => {
        vi.useFakeTimers();
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
          streamingState: 'responding',
          submitQuery: vi.fn(),
          initError: null,
          pendingHistoryItems: [],
          thought: { subject: 'Executing shell command' },
          cancelOngoingRequest: vi.fn(),
          activePtyId: 'pty-1',
          lastOutputTime: 0,
        });

        vi.spyOn(mockConfig, 'isInteractive').mockReturnValue(true);
        vi.spyOn(mockConfig, 'isInteractiveShellEnabled').mockReturnValue(true);

        // Act: Render the container (embeddedShellFocused is false by default in state)
        const { unmount } = renderAppContainer({
          settings: mockSettingsWithTitleEnabled,
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

        unmount();
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
        let lastOutputTime = 1000;
        mockedUseGeminiStream.mockImplementation(() => ({
          streamingState: 'responding',
          submitQuery: vi.fn(),
          initError: null,
          pendingHistoryItems: [],
          thought: { subject: 'Executing shell command' },
          cancelOngoingRequest: vi.fn(),
          activePtyId: 'pty-1',
          lastOutputTime,
        }));

        vi.spyOn(mockConfig, 'isInteractive').mockReturnValue(true);
        vi.spyOn(mockConfig, 'isInteractiveShellEnabled').mockReturnValue(true);

        // Act: Render the container
        const { unmount, rerender } = renderAppContainer({
          settings: mockSettingsWithTitleEnabled,
        });

        // Fast-forward time by 20 seconds
        await act(async () => {
          await vi.advanceTimersByTimeAsync(20000);
        });

        // Update lastOutputTime to simulate new output
        lastOutputTime = 21000;
        mockedUseGeminiStream.mockImplementation(() => ({
          streamingState: 'responding',
          submitQuery: vi.fn(),
          initError: null,
          pendingHistoryItems: [],
          thought: { subject: 'Executing shell command' },
          cancelOngoingRequest: vi.fn(),
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

        unmount();
      });
    });

    it('should pad title to exactly 80 characters', () => {
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

      // Mock the streaming state and thought with a short subject
      const shortTitle = 'Short';
      mockedUseGeminiStream.mockReturnValue({
        streamingState: 'responding',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: { subject: shortTitle },
        cancelOngoingRequest: vi.fn(),
      });

      // Act: Render the container
      const { unmount } = renderAppContainer({
        settings: mockSettingsWithTitleEnabled,
      });

      // Assert: Check that title is padded to exactly 80 characters
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      const calledWith = titleWrites[0][0];
      const expectedTitle = `✦  ${shortTitle} (workspace)`.padEnd(80, ' ');
      const expectedEscapeSequence = `\x1b]0;${expectedTitle}\x07`;
      expect(calledWith).toBe(expectedEscapeSequence);
      unmount();
    });

    it('should use correct ANSI escape code format', () => {
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
      const title = 'Test Title';
      mockedUseGeminiStream.mockReturnValue({
        streamingState: 'responding',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: { subject: title },
        cancelOngoingRequest: vi.fn(),
      });

      // Act: Render the container
      const { unmount } = renderAppContainer({
        settings: mockSettingsWithTitleEnabled,
      });

      // Assert: Check that the correct ANSI escape sequence is used
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      const expectedEscapeSequence = `\x1b]0;${`✦  ${title} (workspace)`.padEnd(80, ' ')}\x07`;
      expect(titleWrites[0][0]).toBe(expectedEscapeSequence);
      unmount();
    });

    it('should use CLI_TITLE environment variable when set', () => {
      // Arrange: Set up mock settings with showStatusInTitle disabled (so it shows suffix)
      const mockSettingsWithTitleDisabled = {
        ...mockSettings,
        merged: {
          ...mockSettings.merged,
          ui: {
            ...mockSettings.merged.ui,
            showStatusInTitle: false,
            hideWindowTitle: false,
          },
        },
      } as unknown as LoadedSettings;

      // Mock CLI_TITLE environment variable
      vi.stubEnv('CLI_TITLE', 'Custom Gemini Title');

      // Mock the streaming state
      mockedUseGeminiStream.mockReturnValue({
        streamingState: 'responding',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: vi.fn(),
      });

      // Act: Render the container
      const { unmount } = renderAppContainer({
        settings: mockSettingsWithTitleDisabled,
      });

      // Assert: Check that title was updated with CLI_TITLE value
      const titleWrites = mocks.mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]0;'),
      );

      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]0;${'✦  Working… (Custom Gemini Title)'.padEnd(80, ' ')}\x07`,
      );
      unmount();
    });
  });

  describe('Queue Error Message', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('should set and clear the queue error message after a timeout', async () => {
      const { rerender, unmount } = renderAppContainer();
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      expect(capturedUIState.queueErrorMessage).toBeNull();

      act(() => {
        capturedUIActions.setQueueErrorMessage('Test error');
      });
      rerender(getAppContainer());
      expect(capturedUIState.queueErrorMessage).toBe('Test error');

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      rerender(getAppContainer());
      expect(capturedUIState.queueErrorMessage).toBeNull();
      unmount();
    });

    it('should reset the timer if a new error message is set', async () => {
      const { rerender, unmount } = renderAppContainer();
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      act(() => {
        capturedUIActions.setQueueErrorMessage('First error');
      });
      rerender(getAppContainer());
      expect(capturedUIState.queueErrorMessage).toBe('First error');

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      act(() => {
        capturedUIActions.setQueueErrorMessage('Second error');
      });
      rerender(getAppContainer());
      expect(capturedUIState.queueErrorMessage).toBe('Second error');

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      rerender(getAppContainer());
      expect(capturedUIState.queueErrorMessage).toBe('Second error');

      // 5. Advance time past the 3 second timeout from the second message
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      rerender(getAppContainer());
      expect(capturedUIState.queueErrorMessage).toBeNull();
      unmount();
    });
  });

  describe('Terminal Height Calculation', () => {
    const mockedMeasureElement = measureElement as Mock;
    const mockedUseTerminalSize = useTerminalSize as Mock;

    it('should prevent terminal height from being less than 1', async () => {
      const resizePtySpy = vi.spyOn(ShellExecutionService, 'resizePty');
      // Arrange: Simulate a small terminal and a large footer
      mockedUseTerminalSize.mockReturnValue({ columns: 80, rows: 5 });
      mockedMeasureElement.mockReturnValue({ width: 80, height: 10 }); // Footer is taller than the screen

      mockedUseGeminiStream.mockReturnValue({
        streamingState: 'idle',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: vi.fn(),
        activePtyId: 'some-id',
      });

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(resizePtySpy).toHaveBeenCalled());
      const lastCall =
        resizePtySpy.mock.calls[resizePtySpy.mock.calls.length - 1];
      // Check the height argument specifically
      expect(lastCall[2]).toBe(1);
      unmount!();
    });
  });

  describe('Keyboard Input Handling (CTRL+C / CTRL+D)', () => {
    let handleGlobalKeypress: (key: Key) => void;
    let mockHandleSlashCommand: Mock;
    let mockCancelOngoingRequest: Mock;
    let rerender: () => void;
    let unmount: () => void;

    // Helper function to reduce boilerplate in tests
    const setupKeypressTest = async () => {
      const renderResult = renderAppContainer();
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      rerender = () => renderResult.rerender(getAppContainer());
      unmount = renderResult.unmount;
    };

    const pressKey = (key: Partial<Key>, times = 1) => {
      for (let i = 0; i < times; i++) {
        act(() => {
          handleGlobalKeypress({
            name: 'c',
            ctrl: false,
            meta: false,
            shift: false,
            ...key,
          } as Key);
        });
        rerender();
      }
    };

    beforeEach(() => {
      // Capture the keypress handler from the AppContainer
      mockedUseKeypress.mockImplementation((callback: (key: Key) => void) => {
        handleGlobalKeypress = callback;
      });

      // Mock slash command handler
      mockHandleSlashCommand = vi.fn();
      mockedUseSlashCommandProcessor.mockReturnValue({
        handleSlashCommand: mockHandleSlashCommand,
        slashCommands: [],
        pendingHistoryItems: [],
        commandContext: {},
        shellConfirmationRequest: null,
        confirmationRequest: null,
      });

      // Mock request cancellation
      mockCancelOngoingRequest = vi.fn();
      mockedUseGeminiStream.mockReturnValue({
        streamingState: 'idle',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: mockCancelOngoingRequest,
      });

      // Default empty text buffer
      mockedUseTextBuffer.mockReturnValue({
        text: '',
        setText: vi.fn(),
      });

      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    describe('CTRL+C', () => {
      it('should cancel ongoing request on first press', async () => {
        mockedUseGeminiStream.mockReturnValue({
          streamingState: 'responding',
          submitQuery: vi.fn(),
          initError: null,
          pendingHistoryItems: [],
          thought: null,
          cancelOngoingRequest: mockCancelOngoingRequest,
        });
        await setupKeypressTest();

        pressKey({ name: 'c', ctrl: true });

        expect(mockCancelOngoingRequest).toHaveBeenCalledTimes(1);
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();
        unmount();
      });

      it('should quit on second press', async () => {
        await setupKeypressTest();

        pressKey({ name: 'c', ctrl: true }, 2);

        expect(mockCancelOngoingRequest).toHaveBeenCalledTimes(2);
        expect(mockHandleSlashCommand).toHaveBeenCalledWith(
          '/quit',
          undefined,
          undefined,
          false,
        );
        unmount();
      });

      it('should reset press count after a timeout', async () => {
        await setupKeypressTest();

        pressKey({ name: 'c', ctrl: true });
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();

        // Advance timer past the reset threshold
        act(() => {
          vi.advanceTimersByTime(1001);
        });

        pressKey({ name: 'c', ctrl: true });
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();
        unmount();
      });
    });

    describe('CTRL+D', () => {
      it('should do nothing if text buffer is not empty', async () => {
        mockedUseTextBuffer.mockReturnValue({
          text: 'some text',
          setText: vi.fn(),
        });
        await setupKeypressTest();

        pressKey({ name: 'd', ctrl: true }, 2);

        expect(mockHandleSlashCommand).not.toHaveBeenCalled();
        unmount();
      });

      it('should quit on second press if buffer is empty', async () => {
        await setupKeypressTest();

        pressKey({ name: 'd', ctrl: true }, 2);

        expect(mockHandleSlashCommand).toHaveBeenCalledWith(
          '/quit',
          undefined,
          undefined,
          false,
        );
        unmount();
      });

      it('should reset press count after a timeout', async () => {
        await setupKeypressTest();

        pressKey({ name: 'd', ctrl: true });
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();

        // Advance timer past the reset threshold
        act(() => {
          vi.advanceTimersByTime(1001);
        });

        pressKey({ name: 'd', ctrl: true });
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();
        unmount();
      });
    });
  });

  describe('Copy Mode (CTRL+S)', () => {
    let handleGlobalKeypress: (key: Key) => void;
    let rerender: () => void;
    let unmount: () => void;

    const setupCopyModeTest = async (isAlternateMode = false) => {
      // Update settings for this test run
      const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
      const testSettings = {
        ...mockSettings,
        merged: {
          ...defaultMergedSettings,
          ui: {
            ...defaultMergedSettings.ui,
            useAlternateBuffer: isAlternateMode,
          },
        },
      } as unknown as LoadedSettings;

      const renderResult = renderAppContainer({ settings: testSettings });
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      rerender = () =>
        renderResult.rerender(getAppContainer({ settings: testSettings }));
      unmount = renderResult.unmount;
    };

    beforeEach(() => {
      mocks.mockStdout.write.mockClear();
      mockedUseKeypress.mockImplementation((callback: (key: Key) => void) => {
        handleGlobalKeypress = callback;
      });
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    describe.each([
      {
        isAlternateMode: false,
        shouldEnable: false,
        modeName: 'Normal Mode',
      },
      {
        isAlternateMode: true,
        shouldEnable: true,
        modeName: 'Alternate Buffer Mode',
      },
    ])('$modeName', ({ isAlternateMode, shouldEnable }) => {
      it(`should ${shouldEnable ? 'toggle' : 'NOT toggle'} mouse off when Ctrl+S is pressed`, async () => {
        await setupCopyModeTest(isAlternateMode);
        mocks.mockStdout.write.mockClear(); // Clear initial enable call

        act(() => {
          handleGlobalKeypress({
            name: 's',
            ctrl: true,
            meta: false,
            shift: false,
            insertable: false,
            sequence: '\x13',
          });
        });
        rerender();

        if (shouldEnable) {
          expect(disableMouseEvents).toHaveBeenCalled();
        } else {
          expect(disableMouseEvents).not.toHaveBeenCalled();
        }
        unmount();
      });

      if (shouldEnable) {
        it('should toggle mouse back on when Ctrl+S is pressed again', async () => {
          await setupCopyModeTest(isAlternateMode);
          (writeToStdout as Mock).mockClear();

          // Turn it on (disable mouse)
          act(() => {
            handleGlobalKeypress({
              name: 's',
              ctrl: true,
              meta: false,
              shift: false,
              insertable: false,
              sequence: '\x13',
            });
          });
          rerender();
          expect(disableMouseEvents).toHaveBeenCalled();

          // Turn it off (enable mouse)
          act(() => {
            handleGlobalKeypress({
              name: 'any', // Any key should exit copy mode
              ctrl: false,
              meta: false,
              shift: false,
              insertable: true,
              sequence: 'a',
            });
          });
          rerender();

          expect(enableMouseEvents).toHaveBeenCalled();
          unmount();
        });

        it('should exit copy mode on any key press', async () => {
          await setupCopyModeTest(isAlternateMode);

          // Enter copy mode
          act(() => {
            handleGlobalKeypress({
              name: 's',
              ctrl: true,
              meta: false,
              shift: false,
              insertable: false,
              sequence: '\x13',
            });
          });
          rerender();

          (writeToStdout as Mock).mockClear();

          // Press any other key
          act(() => {
            handleGlobalKeypress({
              name: 'a',
              ctrl: false,
              meta: false,
              shift: false,
              insertable: true,
              sequence: 'a',
            });
          });
          rerender();

          // Should have re-enabled mouse
          expect(enableMouseEvents).toHaveBeenCalled();
          unmount();
        });
      }
    });
  });

  describe('Model Dialog Integration', () => {
    it('should provide isModelDialogOpen in the UIStateContext', async () => {
      mockedUseModelCommand.mockReturnValue({
        isModelDialogOpen: true,
        openModelDialog: vi.fn(),
        closeModelDialog: vi.fn(),
      });

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());

      expect(capturedUIState.isModelDialogOpen).toBe(true);
      unmount!();
    });

    it('should provide model dialog actions in the UIActionsContext', async () => {
      const mockCloseModelDialog = vi.fn();

      mockedUseModelCommand.mockReturnValue({
        isModelDialogOpen: false,
        openModelDialog: vi.fn(),
        closeModelDialog: mockCloseModelDialog,
      });

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());

      // Verify that the actions are correctly passed through context
      act(() => {
        capturedUIActions.closeModelDialog();
      });
      expect(mockCloseModelDialog).toHaveBeenCalled();
      unmount!();
    });
  });

  describe('CoreEvents Integration', () => {
    it('subscribes to UserFeedback and drains backlog on mount', async () => {
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());

      expect(mockCoreEvents.on).toHaveBeenCalledWith(
        CoreEvent.UserFeedback,
        expect.any(Function),
      );
      expect(mockCoreEvents.drainBacklogs).toHaveBeenCalledTimes(1);
      unmount!();
    });

    it('unsubscribes from UserFeedback on unmount', async () => {
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());

      unmount!();

      expect(mockCoreEvents.off).toHaveBeenCalledWith(
        CoreEvent.UserFeedback,
        expect.any(Function),
      );
    });

    it('adds history item when UserFeedback event is received', async () => {
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());

      // Get the registered handler
      const handler = mockCoreEvents.on.mock.calls.find(
        (call: unknown[]) => call[0] === CoreEvent.UserFeedback,
      )?.[1];
      expect(handler).toBeDefined();

      // Simulate an event
      const payload: UserFeedbackPayload = {
        severity: 'error',
        message: 'Test error message',
      };
      act(() => {
        handler(payload);
      });

      expect(mockedUseHistory().addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text: 'Test error message',
        }),
        expect.any(Number),
      );
      unmount!();
    });

    it('updates currentModel when ModelChanged event is received', async () => {
      // Arrange: Mock initial model
      vi.spyOn(mockConfig, 'getModel').mockReturnValue('initial-model');

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => {
        expect(capturedUIState?.currentModel).toBe('initial-model');
      });

      // Get the registered handler for ModelChanged
      const handler = mockCoreEvents.on.mock.calls.find(
        (call: unknown[]) => call[0] === CoreEvent.ModelChanged,
      )?.[1];
      expect(handler).toBeDefined();

      // Act: Simulate ModelChanged event
      // Update config mock to return new model since the handler reads from config
      vi.spyOn(mockConfig, 'getModel').mockReturnValue('new-model');
      act(() => {
        handler({ model: 'new-model' });
      });

      // Assert: Verify model is updated
      await waitFor(() => {
        expect(capturedUIState.currentModel).toBe('new-model');
      });
      unmount!();
    });

    it('provides activeHooks from useHookDisplayState', async () => {
      const mockHooks = [{ name: 'hook1', eventName: 'event1' }];
      mockedUseHookDisplayState.mockReturnValue(mockHooks);

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());

      expect(capturedUIState.activeHooks).toEqual(mockHooks);
      unmount!();
    });
  });

  describe('Shell Interaction', () => {
    it('should not crash if resizing the pty fails', async () => {
      const resizePtySpy = vi
        .spyOn(ShellExecutionService, 'resizePty')
        .mockImplementation(() => {
          throw new Error('Cannot resize a pty that has already exited');
        });

      mockedUseGeminiStream.mockReturnValue({
        streamingState: 'idle',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: vi.fn(),
        activePtyId: 'some-pty-id', // Make sure activePtyId is set
      });

      // The main assertion is that the render does not throw.
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });

      await waitFor(() => expect(resizePtySpy).toHaveBeenCalled());
      unmount!();
    });
  });
  describe('Banner Text', () => {
    it('should render placeholder banner text for USE_GEMINI auth type', async () => {
      const config = makeFakeConfig();
      vi.spyOn(config, 'getContentGeneratorConfig').mockReturnValue({
        authType: AuthType.USE_GEMINI,
        apiKey: 'fake-key',
      });
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => {
        expect(capturedUIState.bannerData.defaultText).toBeDefined();
        unmount!();
      });
    });
  });

  describe('onCancelSubmit Behavior', () => {
    let mockSetText: Mock;

    // Helper to extract arguments from the useGeminiStream hook call
    // This isolates the positional argument dependency to a single location
    const extractUseGeminiStreamArgs = (args: unknown[]) => ({
      onCancelSubmit: args[13] as (shouldRestorePrompt?: boolean) => void,
    });

    beforeEach(() => {
      mockSetText = vi.fn();
      mockedUseTextBuffer.mockReturnValue({
        text: '',
        setText: mockSetText,
      });
    });

    it('clears the prompt when onCancelSubmit is called with shouldRestorePrompt=false', async () => {
      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() => expect(capturedUIState).toBeTruthy());

      const { onCancelSubmit } = extractUseGeminiStreamArgs(
        mockedUseGeminiStream.mock.lastCall!,
      );

      act(() => {
        onCancelSubmit(false);
      });

      expect(mockSetText).toHaveBeenCalledWith('');

      unmount!();
    });

    it('restores the prompt when onCancelSubmit is called with shouldRestorePrompt=true (or undefined)', async () => {
      // Mock useInputHistoryStore to provide input history
      mockedUseInputHistoryStore.mockReturnValue({
        inputHistory: ['previous message'],
        addInput: vi.fn(),
        initializeFromLogger: vi.fn(),
      });

      let unmount: () => void;
      await act(async () => {
        const result = renderAppContainer();
        unmount = result.unmount;
      });
      await waitFor(() =>
        expect(capturedUIState.userMessages).toContain('previous message'),
      );

      const { onCancelSubmit } = extractUseGeminiStreamArgs(
        mockedUseGeminiStream.mock.lastCall!,
      );

      await act(async () => {
        onCancelSubmit(true);
      });

      await waitFor(() => {
        expect(mockSetText).toHaveBeenCalledWith('previous message');
      });

      unmount!();
    });

    it('input history is independent from conversation history (survives /clear)', async () => {
      // This test verifies that input history (used for up-arrow navigation) is maintained
      // separately from conversation history and survives /clear operations.
      const mockAddInput = vi.fn();
      mockedUseInputHistoryStore.mockReturnValue({
        inputHistory: ['first prompt', 'second prompt'],
        addInput: mockAddInput,
        initializeFromLogger: vi.fn(),
      });

      let rerender: (tree: ReactElement) => void;
      let unmount;
      await act(async () => {
        const result = renderAppContainer();
        rerender = result.rerender;
        unmount = result.unmount;
      });

      // Verify userMessages is populated from inputHistory
      await waitFor(() =>
        expect(capturedUIState.userMessages).toContain('first prompt'),
      );
      expect(capturedUIState.userMessages).toContain('second prompt');

      // Clear the conversation history (simulating /clear command)
      const mockClearItems = vi.fn();
      mockedUseHistory.mockReturnValue({
        history: [],
        addItem: vi.fn(),
        updateItem: vi.fn(),
        clearItems: mockClearItems,
        loadHistory: vi.fn(),
      });

      await act(async () => {
        // Rerender to apply the new mock.
        rerender(getAppContainer());
      });

      // Verify that userMessages still contains the input history
      // (it should not be affected by clearing conversation history)
      expect(capturedUIState.userMessages).toContain('first prompt');
      expect(capturedUIState.userMessages).toContain('second prompt');

      unmount!();
    });
  });

  describe('Regression Tests', () => {
    it('does not refresh static on startup if banner text is empty', async () => {
      // Mock banner text to be empty strings
      vi.spyOn(mockConfig, 'getBannerTextNoCapacityIssues').mockResolvedValue(
        '',
      );
      vi.spyOn(mockConfig, 'getBannerTextCapacityIssues').mockResolvedValue('');

      // Clear previous calls
      mocks.mockStdout.write.mockClear();

      let compUnmount: () => void = () => {};
      await act(async () => {
        const { unmount } = renderAppContainer();
        compUnmount = unmount;
      });

      // Allow async effects to run
      await waitFor(() => expect(capturedUIState).toBeTruthy());

      // Wait for fetchBannerTexts to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Check that clearTerminal was NOT written to stdout
      const clearTerminalCalls = mocks.mockStdout.write.mock.calls.filter(
        (call: unknown[]) => call[0] === ansiEscapes.clearTerminal,
      );

      expect(clearTerminalCalls).toHaveLength(0);
      compUnmount();
    });
  });
});
