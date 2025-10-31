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
import { render, cleanup } from 'ink-testing-library';
import { AppContainer } from './AppContainer.js';
import {
  type Config,
  makeFakeConfig,
  CoreEvent,
  type UserFeedbackPayload,
} from '@google/gemini-cli-core';

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
import { useContext } from 'react';

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
import { useKeypress, type Key } from './hooks/useKeypress.js';
import { measureElement } from 'ink';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { ShellExecutionService } from '@google/gemini-cli-core';
import { type ExtensionManager } from '../config/extension-manager.js';

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
    });
    mockedUseLogger.mockReturnValue({
      getPreviousUserMessages: vi.fn().mockResolvedValue([]),
    });
    mockedUseLoadingIndicator.mockReturnValue({
      elapsedTime: '0.0s',
      currentLoadingPhrase: '',
    });

    mockConfig = makeFakeConfig();

    vi.spyOn(mockConfig, 'getTargetDir').mockReturnValue('/test/workspace');

    mockExtensionManager = vi.mockObject({
      getExtensions: vi.fn().mockReturnValue([]),
      setRequestConsent: vi.fn(),
      setRequestSetting: vi.fn(),
    } as unknown as ExtensionManager);
    vi.spyOn(mockConfig, 'getExtensionLoader').mockReturnValue(
      mockExtensionManager,
    );

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
    it('renders without crashing with minimal props', () => {
      expect(() => {
        render(
          <AppContainer
            config={mockConfig}
            settings={mockSettings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
      }).not.toThrow();
    });

    it('renders with startup warnings', () => {
      const startupWarnings = ['Warning 1', 'Warning 2'];

      expect(() => {
        render(
          <AppContainer
            config={mockConfig}
            settings={mockSettings}
            startupWarnings={startupWarnings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
      }).not.toThrow();
    });
  });

  describe('State Initialization', () => {
    it('initializes with theme error from initialization result', () => {
      const initResultWithError = {
        ...mockInitResult,
        themeError: 'Failed to load theme',
      };

      expect(() => {
        render(
          <AppContainer
            config={mockConfig}
            settings={mockSettings}
            version="1.0.0"
            initializationResult={initResultWithError}
          />,
        );
      }).not.toThrow();
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
    it('provides AppContext with correct values', () => {
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="2.0.0"
          initializationResult={mockInitResult}
        />,
      );

      expect(() => unmount()).not.toThrow();
    });

    it('provides UIStateContext with state management', () => {
      expect(() => {
        render(
          <AppContainer
            config={mockConfig}
            settings={mockSettings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
      }).not.toThrow();
    });

    it('provides UIActionsContext with action handlers', () => {
      expect(() => {
        render(
          <AppContainer
            config={mockConfig}
            settings={mockSettings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
      }).not.toThrow();
    });

    it('provides ConfigContext with config object', () => {
      expect(() => {
        render(
          <AppContainer
            config={mockConfig}
            settings={mockSettings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
      }).not.toThrow();
    });
  });

  describe('Settings Integration', () => {
    it('handles settings with all display options disabled', () => {
      const settingsAllHidden = {
        merged: {
          hideBanner: true,
          hideFooter: true,
          hideTips: true,
          showMemoryUsage: false,
        },
      } as unknown as LoadedSettings;

      expect(() => {
        render(
          <AppContainer
            config={mockConfig}
            settings={settingsAllHidden}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
      }).not.toThrow();
    });

    it('handles settings with memory usage enabled', () => {
      const settingsWithMemory = {
        merged: {
          hideBanner: false,
          hideFooter: false,
          hideTips: false,
          showMemoryUsage: true,
        },
      } as unknown as LoadedSettings;

      expect(() => {
        render(
          <AppContainer
            config={mockConfig}
            settings={settingsWithMemory}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
      }).not.toThrow();
    });
  });

  describe('Version Handling', () => {
    it.each(['1.0.0', '2.1.3-beta', '3.0.0-nightly'])(
      'handles version format: %s',
      (version) => {
        expect(() => {
          render(
            <AppContainer
              config={mockConfig}
              settings={mockSettings}
              version={version}
              initializationResult={mockInitResult}
            />,
          );
        }).not.toThrow();
      },
    );
  });

  describe('Error Handling', () => {
    it('handles config methods that might throw', () => {
      const errorConfig = makeFakeConfig();
      vi.spyOn(errorConfig, 'getModel').mockImplementation(() => {
        throw new Error('Config error');
      });

      // Should still render without crashing - errors should be handled internally
      expect(() => {
        render(
          <AppContainer
            config={errorConfig}
            settings={mockSettings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
      }).not.toThrow();
    });

    it('handles undefined settings gracefully', () => {
      const undefinedSettings = {
        merged: {},
      } as LoadedSettings;

      expect(() => {
        render(
          <AppContainer
            config={mockConfig}
            settings={undefinedSettings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
      }).not.toThrow();
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
    it('passes a null proQuotaRequest to UIStateContext by default', () => {
<<<<<<< HEAD
=======
      // The default mock from beforeEach already sets proQuotaRequest to null
>>>>>>> d0164791f (refactored unit tests)
      render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      expect(capturedUIState.proQuotaRequest).toBeNull();
    });

    it('passes a valid proQuotaRequest to UIStateContext when provided by the hook', () => {
<<<<<<< HEAD
=======
      // Arrange: Create a mock request object that a UI dialog would receive
>>>>>>> d0164791f (refactored unit tests)
      const mockRequest = {
        failedModel: 'gemini-pro',
        fallbackModel: 'gemini-flash',
        resolve: vi.fn(),
      };
      mockedUseQuotaAndFallback.mockReturnValue({
        proQuotaRequest: mockRequest,
        handleProQuotaChoice: vi.fn(),
      });

<<<<<<< HEAD
=======
      // Act: Render the container
>>>>>>> d0164791f (refactored unit tests)
      render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      expect(capturedUIState.proQuotaRequest).toEqual(mockRequest);
    });

    it('passes the handleProQuotaChoice function to UIActionsContext', () => {
<<<<<<< HEAD
=======
      // Arrange: Create a mock handler function
>>>>>>> d0164791f (refactored unit tests)
      const mockHandler = vi.fn();
      mockedUseQuotaAndFallback.mockReturnValue({
        proQuotaRequest: null,
        handleProQuotaChoice: mockHandler,
      });

<<<<<<< HEAD
=======
      // Act: Render the container
>>>>>>> d0164791f (refactored unit tests)
      render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      expect(capturedUIActions.handleProQuotaChoice).toBe(mockHandler);

<<<<<<< HEAD
=======
      // You can even verify that the plumbed function is callable
>>>>>>> d0164791f (refactored unit tests)
      capturedUIActions.handleProQuotaChoice('auth');
      expect(mockHandler).toHaveBeenCalledWith('auth');
    });
  });

  describe('Terminal Title Update Feature', () => {
    beforeEach(() => {
      mockStdout = { write: vi.fn() };
    });

    it.each([
      {
        description: 'should not update when showStatusInTitle is false',
        settings: { showStatusInTitle: false, hideWindowTitle: false },
        streamingState: 'responding' as const,
        thought: { subject: 'A thought' },
        env: {},
        expectedTitle: null,
      },
      {
        description: 'should not update when hideWindowTitle is true',
        settings: { showStatusInTitle: true, hideWindowTitle: true },
        streamingState: 'responding' as const,
        thought: { subject: 'A thought' },
        env: {},
        expectedTitle: null,
      },
      {
        description: 'should update with thought subject when in active state',
        settings: { showStatusInTitle: true, hideWindowTitle: false },
        streamingState: 'responding' as const,
        thought: { subject: 'Processing request' },
        env: {},
        expectedTitle: 'Processing request',
      },
      {
        description: 'should update with default text when in Idle state',
        settings: { showStatusInTitle: true, hideWindowTitle: false },
        streamingState: 'idle' as const,
        thought: null,
        env: {},
        expectedTitle: 'Gemini - workspace',
      },
      {
        description:
          'should update with confirmation text when in WaitingForConfirmation state',
        settings: { showStatusInTitle: true, hideWindowTitle: false },
        streamingState: 'waitingForConfirmation' as const,
        thought: { subject: 'Confirm tool execution' },
        env: {},
        expectedTitle: 'Confirm tool execution',
      },
      {
        description: 'should pad title to exactly 80 characters',
        settings: { showStatusInTitle: true, hideWindowTitle: false },
        streamingState: 'responding' as const,
        thought: { subject: 'Short' },
        env: {},
        expectedTitle: 'Short',
      },
      {
        description: 'should use CLI_TITLE environment variable when set',
        settings: { showStatusInTitle: true, hideWindowTitle: false },
        streamingState: 'idle' as const,
        thought: null,
        env: { CLI_TITLE: 'Custom Gemini Title' },
        expectedTitle: 'Custom Gemini Title',
      },
    ])(
      '$description',
      ({ settings, streamingState, thought, env, expectedTitle }) => {
        const testSettings = {
          ...mockSettings,
          merged: {
            ...mockSettings.merged,
            ui: {
              ...mockSettings.merged.ui,
              ...settings,
            },
          },
        } as unknown as LoadedSettings;

        mockedUseGeminiStream.mockReturnValue({
          streamingState,
          thought,
          submitQuery: vi.fn(),
          initError: null,
          pendingHistoryItems: [],
          cancelOngoingRequest: vi.fn(),
        });

        if (Object.keys(env).length > 0) {
          vi.stubEnv('CLI_TITLE', env['CLI_TITLE'] as string);
        }

        const { unmount } = render(
          <AppContainer
            config={mockConfig}
            settings={testSettings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );

        const titleWrites = mockStdout.write.mock.calls.filter((call) =>
          (call[0] as string).includes('\x1b]2;'),
        );

        if (expectedTitle === null) {
          expect(titleWrites).toHaveLength(0);
        } else {
          expect(titleWrites).toHaveLength(1);
          const expectedPaddedTitle = expectedTitle.padEnd(80, ' ');
          expect(titleWrites[0][0]).toBe(`\x1b]2;${expectedPaddedTitle}\x07`);
        }

        unmount();
        if (Object.keys(env).length > 0) {
          vi.unstubAllEnvs();
        }
      },
    );
  });

  describe('Queue Error Message', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set and clear the queue error message after a timeout', async () => {
      const { rerender } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      expect(capturedUIState.queueErrorMessage).toBeNull();

      capturedUIActions.setQueueErrorMessage('Test error');
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      expect(capturedUIState.queueErrorMessage).toContain('error');

      vi.advanceTimersByTime(3000);
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      expect(capturedUIState.queueErrorMessage).toBeNull();
    });

    it('should reset the timer if a new error message is set', async () => {
      const { rerender } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      capturedUIActions.setQueueErrorMessage('First error');
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      expect(capturedUIState.queueErrorMessage).toContain('First');

      vi.advanceTimersByTime(1500);

      capturedUIActions.setQueueErrorMessage('Second error');
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      expect(capturedUIState.queueErrorMessage).toContain('Second');

      vi.advanceTimersByTime(2000);
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      expect(capturedUIState.queueErrorMessage).toContain('Second');

      // 5. Advance time past the 3 second timeout from the second message
      vi.advanceTimersByTime(1000);
      rerender(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );
      expect(capturedUIState.queueErrorMessage).toBeNull();
    });
  });

  describe('Terminal Height Calculation', () => {
    const mockedMeasureElement = measureElement as Mock;
    const mockedUseTerminalSize = useTerminalSize as Mock;

    it('should prevent terminal height from being less than 1', () => {
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

      render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      // Assert: The shell should be resized to a minimum height of 1, not a negative number.
      // The old code would have tried to set a negative height.
      expect(resizePtySpy).toHaveBeenCalled();
      const lastCall =
        resizePtySpy.mock.calls[resizePtySpy.mock.calls.length - 1];
      // Check the height argument specifically
      expect(lastCall[2]).toBe(1);
    });
  });

  describe('Keyboard Input Handling (CTRL+C / CTRL+D)', () => {
    let handleGlobalKeypress: (key: Key) => void;
    let mockHandleSlashCommand: Mock;
    let mockCancelOngoingRequest: Mock;
    let rerender: () => void;

    // Helper function to reduce boilerplate in tests
    const setupKeypressTest = () => {
      const { rerender: inkRerender } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      rerender = () =>
        inkRerender(
          <AppContainer
            config={mockConfig}
            settings={mockSettings}
            version="1.0.0"
            initializationResult={mockInitResult}
          />,
        );
    };

    const pressKey = (key: Partial<Key>, times = 1) => {
      for (let i = 0; i < times; i++) {
        handleGlobalKeypress({
          name: 'c',
          ctrl: false,
          meta: false,
          shift: false,
          ...key,
        } as Key);
        rerender();
      }
    };

    beforeEach(() => {
      mockedUseKeypress.mockImplementation((callback: (key: Key) => void) => {
        handleGlobalKeypress = callback;
      });

      mockHandleSlashCommand = vi.fn();
      mockedUseSlashCommandProcessor.mockReturnValue({
        handleSlashCommand: mockHandleSlashCommand,
        slashCommands: [],
        pendingHistoryItems: [],
        commandContext: {},
        shellConfirmationRequest: null,
        confirmationRequest: null,
      });

      mockCancelOngoingRequest = vi.fn();
      mockedUseGeminiStream.mockReturnValue({
        streamingState: 'idle',
        submitQuery: vi.fn(),
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: mockCancelOngoingRequest,
      });

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
      it('should cancel ongoing request on first press', () => {
        mockedUseGeminiStream.mockReturnValue({
          streamingState: 'responding',
          submitQuery: vi.fn(),
          initError: null,
          pendingHistoryItems: [],
          thought: null,
          cancelOngoingRequest: mockCancelOngoingRequest,
        });
        setupKeypressTest();

        pressKey({ name: 'c', ctrl: true });

        expect(mockCancelOngoingRequest).toHaveBeenCalledTimes(1);
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();
      });

      it('should quit on second press', () => {
        setupKeypressTest();

        pressKey({ name: 'c', ctrl: true }, 2);

        expect(mockCancelOngoingRequest).toHaveBeenCalledTimes(2);
        expect(mockHandleSlashCommand).toHaveBeenCalledWith('/quit');
      });

      it('should reset press count after a timeout', () => {
        setupKeypressTest();

        pressKey({ name: 'c', ctrl: true });
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();

        // Advance timer past the reset threshold
        vi.advanceTimersByTime(1001);

        pressKey({ name: 'c', ctrl: true });
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();
      });
    });

    describe('CTRL+D', () => {
      it('should do nothing if text buffer is not empty', () => {
        mockedUseTextBuffer.mockReturnValue({
          text: 'some text',
          setText: vi.fn(),
        });
        setupKeypressTest();

        pressKey({ name: 'd', ctrl: true }, 2);

        expect(mockHandleSlashCommand).not.toHaveBeenCalled();
      });

      it('should quit on second press if buffer is empty', () => {
        setupKeypressTest();

        pressKey({ name: 'd', ctrl: true }, 2);

        expect(mockHandleSlashCommand).toHaveBeenCalledWith('/quit');
      });

      it('should reset press count after a timeout', () => {
        setupKeypressTest();

        pressKey({ name: 'd', ctrl: true });
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();

        // Advance timer past the reset threshold
        vi.advanceTimersByTime(1001);

        pressKey({ name: 'd', ctrl: true });
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();
      });
    });
  });

  describe('Model Dialog Integration', () => {
    it('should provide isModelDialogOpen in the UIStateContext', () => {
      mockedUseModelCommand.mockReturnValue({
        isModelDialogOpen: true,
        openModelDialog: vi.fn(),
        closeModelDialog: vi.fn(),
      });

      render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      expect(capturedUIState.isModelDialogOpen).toBe(true);
    });

    it('should provide model dialog actions in the UIActionsContext', () => {
      const mockCloseModelDialog = vi.fn();

      mockedUseModelCommand.mockReturnValue({
        isModelDialogOpen: false,
        openModelDialog: vi.fn(),
        closeModelDialog: mockCloseModelDialog,
      });

      render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      capturedUIActions.closeModelDialog();
      // Verify that the actions are correctly passed through context
      capturedUIActions.closeModelDialog();
      expect(mockCloseModelDialog).toHaveBeenCalled();
    });
  });

  describe('CoreEvents Integration', () => {
    it('subscribes to UserFeedback and drains backlog on mount', () => {
      render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      expect(mockCoreEvents.on).toHaveBeenCalledWith(
        CoreEvent.UserFeedback,
        expect.any(Function),
      );
      expect(mockCoreEvents.drainFeedbackBacklog).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes from UserFeedback on unmount', () => {
      const { unmount } = render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      unmount();

      expect(mockCoreEvents.off).toHaveBeenCalledWith(
        CoreEvent.UserFeedback,
        expect.any(Function),
      );
    });

    it('adds history item when UserFeedback event is received', () => {
      render(
        <AppContainer
          config={mockConfig}
          settings={mockSettings}
          version="1.0.0"
          initializationResult={mockInitResult}
        />,
      );

      const handler = mockCoreEvents.on.mock.calls.find(
        (call: unknown[]) => call[0] === CoreEvent.UserFeedback,
      )?.[1];
      expect(handler).toBeDefined();

      const payload: UserFeedbackPayload = {
        severity: 'error',
        message: 'Test error message',
      };
      handler(payload);

      expect(mockedUseHistory().addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text: expect.stringContaining('error message'),
        }),
        expect.any(Number),
      );
    });
  });
});
