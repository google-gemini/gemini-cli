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
} from 'vitest';
import { render as inkRender } from '../test-utils/render.js';
import { act } from 'react';
import { AppContainer } from './AppContainer.js';
import { SettingsContext } from './contexts/SettingsContext.js';
import {
  type Config,
  makeFakeConfig,
  enableMouseEvents,
  disableMouseEvents,
  writeToStdout,
} from '@google/gemini-cli-core';
import { type Key } from './hooks/useKeypress.js';
import type { ExtensionManager } from '../config/extension-manager.js';
import type { LoadedSettings } from '../config/settings.js';
import type { InitializationResult } from '../core/initializer.js';

// Mocks
const mocks = vi.hoisted(() => ({
  mockStdout: { write: vi.fn(), emit: vi.fn() },
  mockStdin: {
    isTTY: true,
    setRawMode: vi.fn(),
    resume: vi.fn(),
    ref: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
  },
  mockApp: { rerender: vi.fn(), exit: vi.fn() },
  useKeypressMock: vi.fn(),
}));

// Mock process
const mockProcessStdoutWrite = vi
  .spyOn(process.stdout, 'write')
  .mockImplementation(() => true);
vi.spyOn(process.stdout, 'emit').mockImplementation(() => true);
const mockProcessOn = vi.spyOn(process, 'on').mockImplementation(() => process);
vi.spyOn(process, 'kill').mockImplementation(() => true);
vi.spyOn(process, 'off').mockImplementation(() => process);

vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    useStdout: () => ({ stdout: mocks.mockStdout }),
    useStdin: () => ({
      stdin: mocks.mockStdin,
      setRawMode: mocks.mockStdin.setRawMode,
    }),
    useApp: () => mocks.mockApp,
    measureElement: vi.fn(),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    enableMouseEvents: vi.fn(),
    disableMouseEvents: vi.fn(),
    writeToStdout: vi.fn(),
    startupProfiler: { start: vi.fn(), end: vi.fn(), flush: vi.fn() },
    generateSummary: vi.fn().mockResolvedValue(''),
  };
});

// Mock all the hooks used in AppContainer to avoid complex setup
vi.mock('./hooks/useQuotaAndFallback.js', () => ({
  useQuotaAndFallback: () => ({
    proQuotaRequest: null,
    handleProQuotaChoice: vi.fn(),
    validationRequest: null,
    handleValidationChoice: vi.fn(),
  }),
}));
vi.mock('./hooks/useHistoryManager.js', () => ({
  useHistory: () => ({
    history: [],
    addItem: vi.fn(),
    clearItems: vi.fn(),
    loadHistory: vi.fn(),
  }),
}));
vi.mock('./hooks/useThemeCommand.js', () => ({
  useThemeCommand: () => ({
    isThemeDialogOpen: false,
    openThemeDialog: vi.fn(),
    closeThemeDialog: vi.fn(),
    handleThemeSelect: vi.fn(),
    handleThemeHighlight: vi.fn(),
  }),
}));
vi.mock('./auth/useAuth.js', () => ({
  useAuthCommand: () => ({
    authState: 'authenticated',
    setAuthState: vi.fn(),
    authError: null,
    onAuthError: vi.fn(),
    apiKeyDefaultValue: '',
    reloadApiKey: vi.fn(),
  }),
}));
vi.mock('./hooks/useEditorSettings.js', () => ({
  useEditorSettings: () => ({
    isEditorDialogOpen: false,
    openEditorDialog: vi.fn(),
    handleEditorSelect: vi.fn(),
    exitEditorDialog: vi.fn(),
  }),
}));
vi.mock('./hooks/useSettingsCommand.js', () => ({
  useSettingsCommand: () => ({
    isSettingsDialogOpen: false,
    openSettingsDialog: vi.fn(),
    closeSettingsDialog: vi.fn(),
  }),
}));
vi.mock('./hooks/useModelCommand.js', () => ({
  useModelCommand: () => ({
    isModelDialogOpen: false,
    openModelDialog: vi.fn(),
    closeModelDialog: vi.fn(),
  }),
}));
vi.mock('./hooks/slashCommandProcessor.js', () => ({
  useSlashCommandProcessor: () => ({
    handleSlashCommand: vi.fn(),
    slashCommands: [],
    pendingHistoryItems: [],
    commandContext: {},
    confirmationRequest: null,
  }),
}));
vi.mock('./hooks/useConsoleMessages.js', () => ({
  useConsoleMessages: () => ({
    consoleMessages: [],
    clearConsoleMessages: vi.fn(),
  }),
}));
vi.mock('./hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ columns: 80, rows: 24 }),
}));
vi.mock('./hooks/useGeminiStream.js', () => ({
  useGeminiStream: () => ({
    streamingState: 'idle',
    submitQuery: vi.fn(),
    initError: null,
    pendingHistoryItems: [],
    thought: null,
    cancelOngoingRequest: vi.fn(),
    pendingToolCalls: [],
    handleApprovalModeChange: vi.fn(),
    activePtyId: null,
    loopDetectionConfirmationRequest: null,
    lastOutputTime: 0,
    retryStatus: null,
  }),
}));
vi.mock('./hooks/vim.js', () => ({ useVim: () => ({ handleInput: vi.fn() }) }));
vi.mock('./hooks/useFocus.js', () => ({
  useFocus: () => ({ isFocused: true }),
}));
vi.mock('./hooks/useBracketedPaste.js', () => ({
  useBracketedPaste: () => ({}),
}));
vi.mock('./hooks/useLoadingIndicator.js', () => ({
  useLoadingIndicator: () => ({ elapsedTime: 0, currentLoadingPhrase: '' }),
}));
vi.mock('./hooks/useFolderTrust.js', () => ({
  useFolderTrust: () => ({
    isFolderTrustDialogOpen: false,
    handleFolderTrustSelect: vi.fn(),
    isRestarting: false,
  }),
}));
vi.mock('./hooks/useIdeTrustListener.js', () => ({
  useIdeTrustListener: () => ({ needsRestart: false, restartReason: '' }),
}));
vi.mock('./hooks/useMessageQueue.js', () => ({
  useMessageQueue: () => ({
    messageQueue: [],
    addMessage: vi.fn(),
    clearQueue: vi.fn(),
    getQueuedMessagesText: vi.fn(),
    popAllMessages: vi.fn(),
  }),
}));
vi.mock('./hooks/useApprovalModeIndicator.js', () => ({
  useApprovalModeIndicator: () => false,
}));
vi.mock('./hooks/useGitBranchName.js', () => ({ useGitBranchName: () => '' }));
vi.mock('./contexts/VimModeContext.js', () => ({
  VimModeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useVimMode: () => ({ toggleVimEnabled: vi.fn() }),
}));
vi.mock('./contexts/SessionContext.js', () => ({
  useSessionStats: () => ({ stats: {} }),
}));
vi.mock('./components/shared/text-buffer.js', () => ({
  useTextBuffer: () => ({
    text: '',
    setText: vi.fn(),
    viewport: { height: 10, width: 80 },
  }),
  PASTED_TEXT_PLACEHOLDER_REGEX:
    /\[Pasted Text: \d+ (?:lines|chars)(?: #\d+)?\]/g,
}));
vi.mock('./hooks/useLogger.js', () => ({ useLogger: () => ({}) }));
vi.mock('./hooks/useInputHistoryStore.js', () => ({
  useInputHistoryStore: () => ({
    inputHistory: [],
    addInput: vi.fn(),
    initializeFromLogger: vi.fn(),
  }),
}));
vi.mock('./utils/ConsolePatcher.js');
vi.mock('../utils/cleanup.js');
vi.mock('../utils/windowTitle.js', () => ({ computeTerminalTitle: () => '' }));
vi.mock('./hooks/useAlternateBuffer.js', () => ({
  useAlternateBuffer: () => false,
  isAlternateBufferEnabled: () => false,
}));
vi.mock('./hooks/useBanner.js', () => ({
  useBanner: () => ({ bannerText: '' }),
}));
vi.mock('./hooks/useHookDisplayState.js', () => ({
  useHookDisplayState: () => [],
}));
vi.mock('./hooks/useSessionBrowser.js', () => ({
  useSessionBrowser: () => ({
    isSessionBrowserOpen: false,
    openSessionBrowser: vi.fn(),
    closeSessionBrowser: vi.fn(),
    handleResumeSession: vi.fn(),
    handleDeleteSession: vi.fn(),
  }),
}));
vi.mock('./hooks/useSessionResume.js', () => ({
  useSessionResume: () => ({
    loadHistoryForResume: vi.fn(),
    isResuming: false,
  }),
}));
vi.mock('./hooks/useIncludeDirsTrust.js', () => ({
  useIncludeDirsTrust: () => ({}),
}));
vi.mock('./hooks/useExtensionUpdates.js', () => ({
  useConfirmUpdateRequests: () => ({
    addConfirmUpdateExtensionRequest: vi.fn(),
    confirmUpdateExtensionRequests: [],
  }),
  useExtensionUpdates: () => ({
    extensionsUpdateState: {},
    extensionsUpdateStateInternal: {},
    dispatchExtensionStateUpdate: vi.fn(),
  }),
}));
vi.mock('./hooks/useShellInactivityStatus.js', () => ({
  useShellInactivityStatus: () => ({
    shouldShowFocusHint: false,
    inactivityStatus: 'active',
  }),
}));

// Mock useKeypress to capture the handler
vi.mock('./hooks/useKeypress.js', () => ({
  useKeypress: mocks.useKeypressMock,
}));

describe('AppContainer Suspend (Ctrl+Z)', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = makeFakeConfig();
    vi.spyOn(mockConfig, 'getTargetDir').mockReturnValue('/test');
    vi.spyOn(mockConfig, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(mockConfig, 'getExtensionLoader').mockReturnValue({
      setRequestConsent: vi.fn(),
      setRequestSetting: vi.fn(),
      getExtensions: vi.fn().mockReturnValue([]),
    } as unknown as ExtensionManager);

    // Mock process properties
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });
    Object.defineProperty(process, 'stdin', {
      value: mocks.mockStdin,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should suspend process on Ctrl+Z and restore on resume', async () => {
    let capturedHandler: ((key: Key) => void) | undefined;
    mocks.useKeypressMock.mockImplementation((handler) => {
      capturedHandler = handler;
    });

    // Render AppContainer
    inkRender(
      <SettingsContext.Provider
        value={
          {
            merged: {
              ui: { useAlternateBuffer: true, hideBanner: false },
              general: { debugKeystrokeLogging: false, preferredEditor: 'vi' },
              security: { auth: { selectedType: 'oauth' } },
              context: { fileName: 'GEMINI.md' },
              tools: { shell: { pager: 'less', showColor: true } },
              ide: { hasSeenNudge: true },
            },
          } as unknown as LoadedSettings
        }
      >
        <AppContainer
          config={mockConfig}
          version="1.0.0"
          initializationResult={{} as unknown as InitializationResult}
        />
      </SettingsContext.Provider>,
    );

    expect(mocks.useKeypressMock).toHaveBeenCalled();
    expect(capturedHandler).toBeDefined();

    // Trigger Ctrl+Z
    await act(async () => {
      capturedHandler!({
        name: 'z',
        ctrl: true,
        alt: false,
        cmd: false,
        shift: false,
        insertable: false,
        sequence: '\x1a',
      });
    });

    // Verify suspend actions
    // 1. Show cursor
    expect(writeToStdout).toHaveBeenCalledWith('\x1b[?25h');
    // 2. Disable mouse
    expect(disableMouseEvents).toHaveBeenCalled();
    // 3. Disable raw mode
    expect(mocks.mockStdin.setRawMode).toHaveBeenCalledWith(false);
    // 4. Register SIGCONT handler
    expect(process.on).toHaveBeenCalledWith('SIGCONT', expect.any(Function));
    // 5. Send SIGTSTP
    expect(process.kill).toHaveBeenCalledWith(0, 'SIGTSTP');

    // Get the onResume handler
    const onResume = mockProcessOn.mock.calls.find(
      (call) => call[0] === 'SIGCONT',
    )?.[1] as () => void;
    expect(onResume).toBeDefined();

    // Reset mocks to verify resume actions
    (disableMouseEvents as Mock).mockClear();
    (enableMouseEvents as Mock).mockClear();
    mocks.mockStdin.setRawMode.mockClear();
    mockProcessStdoutWrite.mockClear();

    // Simulate SIGCONT (Resume)
    await act(async () => {
      onResume();
    });

    // Verify resume actions
    // 1. Restore raw mode
    expect(mocks.mockStdin.setRawMode).toHaveBeenCalledWith(true);
    expect(mocks.mockStdin.resume).toHaveBeenCalled();
    // 2. Hide cursor
    expect(writeToStdout).toHaveBeenCalledWith('\x1b[?25l');
    // 3. Enable mouse
    expect(enableMouseEvents).toHaveBeenCalled();
    // 4. Emit resize to repaint
    expect(process.stdout.emit).toHaveBeenCalledWith('resize');
    // 5. Cleanup listener
    expect(process.off).toHaveBeenCalledWith('SIGCONT', onResume);
  });
});
