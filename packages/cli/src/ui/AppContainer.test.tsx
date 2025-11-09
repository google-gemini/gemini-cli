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
import { cleanup } from 'ink-testing-library';
import { act, useContext } from 'react';
import { AppContainer } from './AppContainer.js';
import {
  type Config,
  makeFakeConfig,
  CoreEvent,
  type UserFeedbackPayload,
} from '@google/gemini-cli-core';

// Mock coreEvents
const mockCoreEvents = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  drainFeedbackBacklog: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    coreEvents: mockCoreEvents,
  };
});
import type { LoadedSettings } from '../config/settings.js';
import type { InitializationResult } from '../core/initializer.js';
import { useQuotaAndFallback } from './hooks/useQuotaAndFallback.js';
import { UIStateContext, type UIState } from './contexts/UIStateContext.js';
import {
  UIActionsContext,
  type UIActions,
} from './contexts/UIActionsContext.js';

// Mock useStdout to capture terminal title writes
let mockStdout: { write: ReturnType<typeof vi.fn> };
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    useStdout: () => ({ stdout: mockStdout }),
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

// Mock external utilities
vi.mock('../utils/events.js');
vi.mock('../utils/handleAutoUpdate.js');
vi.mock('./utils/ConsolePatcher.js');
vi.mock('../utils/cleanup.js');
vi.mock('./utils/mouse.js', () => ({
  enableMouseEvents: vi.fn(),
  disableMouseEvents: vi.fn(),
}));

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
import { useKeypress, type Key } from './hooks/useKeypress.js';
import { measureElement } from 'ink';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { ShellExecutionService } from '@google/gemini-cli-core';
import { type ExtensionManager } from '../config/extension-manager.js';
import { enableMouseEvents, disableMouseEvents } from './utils/mouse.js';

describe('AppContainer State Management', () => {
  let mockConfig: Config;
  let mockSettings: LoadedSettings;
  let mockInitResult: InitializationResult;
  let mockExtensionManager: MockedObject<ExtensionManager>;

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

  beforeEach(() => {
    vi.clearAllMocks();

    // Initialize mock stdout for terminal title tests
    mockStdout = { write: vi.fn() };

    // Mock computeWindowTitle function to centralize title logic testing
    vi.mock('../utils/windowTitle.js', async () => ({
      computeWindowTitle: vi.fn(
        (folderName: string) =>
          // Default behavior: return "Gemini - {folderName}" unless CLI_TITLE is set
          process.env['CLI_TITLE'] || `Gemini - ${folderName}`,
      ),
    }));

    capturedUIState = null!;
    capturedUIActions = null!;

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
    mockedUseLoadingIndicator.mockReturnValue({
      elapsedTime: '0.0s',
      currentLoadingPhrase: '',
    });

    // Mock Config
    mockConfig = makeFakeConfig();

    // Mock config's getTargetDir to return consistent workspace directory
    vi.spyOn(mockConfig, 'getTargetDir').mockReturnValue('/test/workspace');

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
    mockSettings = {
      merged: {
        hideBanner: false,
        hideFooter: false,
        hideTips: false,
        showMemoryUsage: false,
        theme: 'default',
        ui: {
          showStatusInTitle: false,
          hideWindowTitle: false,
        },
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
  });

  describe('Basic Rendering', () => {
    it('renders without crashing with minimal props', async () => {
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      unmount();
    });

    it('renders with startup warnings', async () => {
      const startupWarnings = ['Warning 1', 'Warning 2'];

      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          startupWarnings={startupWarnings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      unmount();
    });
  });

  describe('State Initialization', () => {
    it('initializes with theme error from initialization result', async () => {
      const initResultWithError = {
        ...mockInitResult,
        themeError: 'Failed to load theme',
      };

      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={initResultWithError}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      unmount();
    });

    it('handles debug mode state', () => {
      const debugConfig = makeFakeConfig();
      vi.spyOn(debugConfig, 'getDebugMode').mockReturnValue(true);

      expect(() => {
        render(
          <AppContainer
            config={debugConfig}
            settings={mockSettings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
      }).not.toThrow();
    });
  });

  describe('Context Providers', () => {
    it('provides AppContext with correct values', async () => {
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="2.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Should render and unmount cleanly
      expect(() => unmount()).not.toThrow();
    });

    it('provides UIStateContext with state management', async () => {
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      unmount();
    });

    it('provides UIActionsContext with action handlers', async () => {
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      unmount();
    });

    it('provides ConfigContext with config object', async () => {
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      unmount();
    });
  });

  describe('Settings Integration', () => {
    it('handles settings with all display options disabled', async () => {
      const settingsAllHidden = {
        merged: {
          hideBanner: true,
          hideFooter: true,
          hideTips: true,
          showMemoryUsage: false,
        },
      } as unknown as LoadedSettings;

      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={settingsAllHidden}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      unmount();
    });

    it('handles settings with memory usage enabled', async () => {
      const settingsWithMemory = {
        merged: {
          hideBanner: false,
          hideFooter: false,
          hideTips: false,
          showMemoryUsage: true,
        },
      } as unknown as LoadedSettings;

      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={settingsWithMemory}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      unmount();
    });
  });

  describe('Version Handling', () => {
    it.each(['1.0.0', '2.1.3-beta', '3.0.0-nightly'])(
      'handles version format: %s',
      async (version) => {
        const { unmount } = render(
          <AppContainer
            config={mockConfig}
            settings={mockSettings}
            version={version}
            initializationResult={mockInitResult}
          />,
        );
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        unmount();
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
      const { unmount } = render(
        <AppContainer
          config={errorConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      unmount();
    });

    it('handles undefined settings gracefully', async () => {
      const undefinedSettings = {
        merged: {},
      } as LoadedSettings;

      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={undefinedSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      unmount();
    });
  });

  describe('Provider Hierarchy', () => {
    it('establishes correct provider nesting order', () => {
      // This tests that all the context providers are properly nested
      // and that the component tree can be built without circular dependencies
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Quota and Fallback Integration', () => {
    it('passes a null proQuotaRequest to UIStateContext by default', async () => {
      // The default mock from beforeEach already sets proQuotaRequest to null
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Assert that the context value is as expected
      expect(capturedUIState.proQuotaRequest).toBeNull();
      unmount();
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
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Assert: The mock request is correctly passed through the context
      expect(capturedUIState.proQuotaRequest).toEqual(mockRequest);
      unmount();
    });

    it('passes the handleProQuotaChoice function to UIActionsContext', async () => {
      // Arrange: Create a mock handler function
      const mockHandler = vi.fn();
      mockedUseQuotaAndFallback.mockReturnValue({
        proQuotaRequest: null,
        handleProQuotaChoice: mockHandler,
      });

      // Act: Render the container
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Assert: The action in the context is the mock handler we provided
      expect(capturedUIActions.handleProQuotaChoice).toBe(mockHandler);

      // You can even verify that the plumbed function is callable
      act(() => {
        capturedUIActions.handleProQuotaChoice('retry_later');
      });
      expect(mockHandler).toHaveBeenCalledWith('retry_later');
      unmount();
    });
  });

  describe('Terminal Title Update Feature', () => {
    beforeEach(() => {
      // Reset mock stdout for each test
      mockStdout = { write: vi.fn() };
    });

    it('should not update terminal title when showStatusInTitle is false', () => {
      // Arrange: Set up mock settings with showStatusInTitle disabled
      const mockSettingsWithShowStatusFalse = {
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

      // Act: Render the container
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettingsWithShowStatusFalse}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      // Assert: Check that no title-related writes occurred
      const titleWrites = mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]2;'),
      );
      expect(titleWrites).toHaveLength(0);
      unmount();
    });

    it('should not update terminal title when hideWindowTitle is true', () => {
      // Arrange: Set up mock settings with hideWindowTitle enabled
      const mockSettingsWithHideTitleTrue = {
        ...mockSettings,
        merged: {
          ...mockSettings.merged,
          ui: {
            ...mockSettings.merged.ui,
            showStatusInTitle: true,
            hideWindowTitle: true,
          },
        },
      } as unknown as LoadedSettings;

      // Act: Render the container
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettingsWithHideTitleTrue}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      // Assert: Check that no title-related writes occurred
      const titleWrites = mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]2;'),
      );
      expect(titleWrites).toHaveLength(0);
      unmount();
    });

    it('should update terminal title with thought subject when in active state', () => {
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
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettingsWithTitleEnabled}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      // Assert: Check that title was updated with thought subject
      const titleWrites = mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]2;'),
      );
      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]2;${thoughtSubject.padEnd(80, ' ')}\x07`,
      );
      unmount();
    });

    it('should update terminal title with default text when in Idle state and no thought subject', () => {
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
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettingsWithTitleEnabled}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      // Assert: Check that title was updated with default Idle text
      const titleWrites = mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]2;'),
      );
      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]2;${'Gemini - workspace'.padEnd(80, ' ')}\x07`,
      );
      unmount();
    });

    it('should update terminal title when in WaitingForConfirmation state with thought subject', () => {
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

      // Mock the streaming state and thought
      const thoughtSubject = 'Confirm tool execution';
      mockedUseGeminiStream.mockReturnValue({
        streamingState: 'waitingForConfirmation',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: { subject: thoughtSubject },
        cancelOngoingRequest: vi.fn(),
      });

      // Act: Render the container
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettingsWithTitleEnabled}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      // Assert: Check that title was updated with confirmation text
      const titleWrites = mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]2;'),
      );
      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]2;${thoughtSubject.padEnd(80, ' ')}\x07`,
      );
      unmount();
    });

    it('should pad title to exactly 80 characters', () => {
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
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettingsWithTitleEnabled}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      // Assert: Check that title is padded to exactly 80 characters
      const titleWrites = mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]2;'),
      );
      expect(titleWrites).toHaveLength(1);
      const calledWith = titleWrites[0][0];
      const expectedTitle = shortTitle.padEnd(80, ' ');

      expect(calledWith).toContain(shortTitle);
      expect(calledWith).toContain('\x1b]2;');
      expect(calledWith).toContain('\x07');
      expect(calledWith).toBe('\x1b]2;' + expectedTitle + '\x07');
      unmount();
    });

    it('should use correct ANSI escape code format', () => {
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
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettingsWithTitleEnabled}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      // Assert: Check that the correct ANSI escape sequence is used
      const titleWrites = mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]2;'),
      );
      expect(titleWrites).toHaveLength(1);
      const expectedEscapeSequence = `\x1b]2;${title.padEnd(80, ' ')}\x07`;
      expect(titleWrites[0][0]).toBe(expectedEscapeSequence);
      unmount();
    });

    it('should use CLI_TITLE environment variable when set', () => {
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

      // Mock CLI_TITLE environment variable
      vi.stubEnv('CLI_TITLE', 'Custom Gemini Title');

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
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettingsWithTitleEnabled}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      // Assert: Check that title was updated with CLI_TITLE value
      const titleWrites = mockStdout.write.mock.calls.filter((call) =>
        call[0].includes('\x1b]2;'),
      );
      expect(titleWrites).toHaveLength(1);
      expect(titleWrites[0][0]).toBe(
        `\x1b]2;${'Custom Gemini Title'.padEnd(80, ' ')}\x07`,
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
    });

    it('should set and clear the queue error message after a timeout', async () => {
      const { rerender, unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      expect(capturedUIState.queueErrorMessage).toBeNull();

      act(() => {
        capturedUIActions.setQueueErrorMessage('Test error');
      });
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      expect(capturedUIState.queueErrorMessage).toBe('Test error');

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      expect(capturedUIState.queueErrorMessage).toBeNull();
      unmount();
    });

    it('should reset the timer if a new error message is set', async () => {
      const { rerender, unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      act(() => {
        capturedUIActions.setQueueErrorMessage('First error');
      });
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      expect(capturedUIState.queueErrorMessage).toBe('First error');

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      act(() => {
        capturedUIActions.setQueueErrorMessage('Second error');
      });
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      expect(capturedUIState.queueErrorMessage).toBe('Second error');

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      expect(capturedUIState.queueErrorMessage).toBe('Second error');

      // 5. Advance time past the 3 second timeout from the second message
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
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

      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Assert: The shell should be resized to a minimum height of 1, not a negative number.
      // The old code would have tried to set a negative height.
      expect(resizePtySpy).toHaveBeenCalled();
      const lastCall =
        resizePtySpy.mock.calls[resizePtySpy.mock.calls.length - 1];
      // Check the height argument specifically
      expect(lastCall[2]).toBe(1);
      unmount();
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
      const renderResult = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      rerender = () =>
        renderResult.rerender(
          <AppContainer
            config={mockConfig}
            settings={mockSettings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
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
        expect(mockHandleSlashCommand).toHaveBeenCalledWith('/quit');
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

        expect(mockHandleSlashCommand).toHaveBeenCalledWith('/quit');
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
      const testSettings = {
        ...mockSettings,
        merged: {
          ...mockSettings.merged,
          ui: {
            ...mockSettings.merged.ui,
            useAlternateBuffer: isAlternateMode,
          },
        },
      } as unknown as LoadedSettings;

      const renderResult = render(
        <AppContainer
          config={mockConfig}
          settings={testSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      rerender = () =>
        renderResult.rerender(
          <AppContainer
            config={mockConfig}
            settings={testSettings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
      unmount = renderResult.unmount;
    };

    beforeEach(() => {
      mockStdout.write.mockClear();
      mockedUseKeypress.mockImplementation((callback: (key: Key) => void) => {
        handleGlobalKeypress = callback;
      });
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
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
        mockStdout.write.mockClear(); // Clear initial enable call

        act(() => {
          handleGlobalKeypress({
            name: 's',
            ctrl: true,
            meta: false,
            shift: false,
            paste: false,
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
          mockStdout.write.mockClear();

          // Turn it on (disable mouse)
          act(() => {
            handleGlobalKeypress({
              name: 's',
              ctrl: true,
              meta: false,
              shift: false,
              paste: false,
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
              paste: false,
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
              paste: false,
              sequence: '\x13',
            });
          });
          rerender();

          mockStdout.write.mockClear();

          // Press any other key
          act(() => {
            handleGlobalKeypress({
              name: 'a',
              ctrl: false,
              meta: false,
              shift: false,
              paste: false,
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

      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(capturedUIState.isModelDialogOpen).toBe(true);
      unmount();
    });

    it('should provide model dialog actions in the UIActionsContext', async () => {
      const mockCloseModelDialog = vi.fn();

      mockedUseModelCommand.mockReturnValue({
        isModelDialogOpen: false,
        openModelDialog: vi.fn(),
        closeModelDialog: mockCloseModelDialog,
      });

      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Verify that the actions are correctly passed through context
      act(() => {
        capturedUIActions.closeModelDialog();
      });
      expect(mockCloseModelDialog).toHaveBeenCalled();
      unmount();
    });
  });

  describe('CoreEvents Integration', () => {
    it('subscribes to UserFeedback and drains backlog on mount', async () => {
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockCoreEvents.on).toHaveBeenCalledWith(
        CoreEvent.UserFeedback,
        expect.any(Function),
      );
      expect(mockCoreEvents.drainFeedbackBacklog).toHaveBeenCalledTimes(1);
      unmount();
    });

    it('unsubscribes from UserFeedback on unmount', async () => {
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      unmount();

      expect(mockCoreEvents.off).toHaveBeenCalledWith(
        CoreEvent.UserFeedback,
        expect.any(Function),
      );
    });

    it('adds history item when UserFeedback event is received', async () => {
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

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
      unmount();
    });

    it('updates currentModel when ModelChanged event is received', async () => {
      // Arrange: Mock initial model
      vi.spyOn(mockConfig, 'getModel').mockReturnValue('initial-model');

      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      // Verify initial model
      await act(async () => {
        await vi.waitFor(() => {
          expect(capturedUIState?.currentModel).toBe('initial-model');
        });
      });

      // Get the registered handler for ModelChanged
      const handler = mockCoreEvents.on.mock.calls.find(
        (call: unknown[]) => call[0] === CoreEvent.ModelChanged,
      )?.[1];
      expect(handler).toBeDefined();

      // Act: Simulate ModelChanged event
      act(() => {
        handler({ model: 'new-model' });
      });

      // Assert: Verify model is updated
      expect(capturedUIState.currentModel).toBe('new-model');
      unmount();
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
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(resizePtySpy).toHaveBeenCalled();
      unmount();
    });
  });
});
