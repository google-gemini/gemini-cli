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
import { useKeypress, type Key } from './hooks/useKeypress.js';
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
  mockApp: { rerender: vi.fn() },
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
  };
});

// Mock all the hooks used in AppContainer to avoid complex setup
vi.mock('./hooks/useQuotaAndFallback.js', () => ({
  useQuotaAndFallback: () => ({ proQuotaRequest: null }),
}));
vi.mock('./hooks/useHistoryManager.js', () => ({
  useHistory: () => ({ history: [], addItem: vi.fn() }),
}));
vi.mock('./hooks/useThemeCommand.js', () => ({ useThemeCommand: () => ({}) }));
vi.mock('./auth/useAuth.js', () => ({
  useAuthCommand: () => ({ authState: 'authenticated' }),
}));
vi.mock('./hooks/useEditorSettings.js', () => ({
  useEditorSettings: () => ({}),
}));
vi.mock('./hooks/useSettingsCommand.js', () => ({
  useSettingsCommand: () => ({}),
}));
vi.mock('./hooks/useModelCommand.js', () => ({ useModelCommand: () => ({}) }));
vi.mock('./hooks/slashCommandProcessor.js', () => ({
  useSlashCommandProcessor: () => ({ handleSlashCommand: vi.fn() }),
}));
vi.mock('./hooks/useConsoleMessages.js', () => ({
  useConsoleMessages: () => ({ consoleMessages: [] }),
}));
vi.mock('./hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ columns: 80, rows: 24 }),
}));
vi.mock('./hooks/useGeminiStream.js', () => ({
  useGeminiStream: () => ({ streamingState: 'idle' }),
}));
vi.mock('./hooks/vim.js', () => ({ useVim: () => ({}) }));
vi.mock('./hooks/useFocus.js', () => ({
  useFocus: () => ({ isFocused: true }),
}));
vi.mock('./hooks/useBracketedPaste.js', () => ({
  useBracketedPaste: () => ({}),
}));
vi.mock('./hooks/useLoadingIndicator.js', () => ({
  useLoadingIndicator: () => ({}),
}));
vi.mock('./hooks/useFolderTrust.js', () => ({ useFolderTrust: () => ({}) }));
vi.mock('./hooks/useIdeTrustListener.js', () => ({
  useIdeTrustListener: () => ({}),
}));
vi.mock('./hooks/useMessageQueue.js', () => ({
  useMessageQueue: () => ({ messageQueue: [] }),
}));
vi.mock('./hooks/useAutoAcceptIndicator.js', () => ({
  useAutoAcceptIndicator: () => false,
}));
vi.mock('./hooks/useGitBranchName.js', () => ({ useGitBranchName: () => '' }));
vi.mock('./contexts/VimModeContext.js', () => ({ useVimMode: () => ({}) }));
vi.mock('./contexts/SessionContext.js', () => ({
  useSessionStats: () => ({ stats: {} }),
}));
vi.mock('./components/shared/text-buffer.js', () => ({
  useTextBuffer: () => ({ text: '' }),
}));
vi.mock('./hooks/useLogger.js', () => ({ useLogger: () => ({}) }));
vi.mock('./hooks/useInputHistoryStore.js', () => ({
  useInputHistoryStore: () => ({}),
}));
vi.mock('./utils/ConsolePatcher.js');
vi.mock('../utils/cleanup.js');
vi.mock('../utils/windowTitle.js', () => ({ computeWindowTitle: () => '' }));

// Mock useKeypress to capture the handler
vi.mock('./hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

describe('AppContainer Suspend (Ctrl+Z)', () => {
  let mockConfig: Config;
  let handleGlobalKeypress: (key: Key) => void;

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

    (useKeypress as Mock).mockImplementation((handler) => {
      handleGlobalKeypress = handler;
    });

    // Mock process properties
    Object.defineProperty(process, 'platform', { value: 'linux' });
    Object.defineProperty(process, 'stdin', { value: mocks.mockStdin });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should suspend process on Ctrl+Z and restore on resume', async () => {
    // Render AppContainer
    const { unmount } = inkRender(
      <SettingsContext.Provider
        value={{ merged: {} } as unknown as LoadedSettings}
      >
        <AppContainer
          config={mockConfig}
          version="1.0.0"
          initializationResult={{} as unknown as InitializationResult}
        />
      </SettingsContext.Provider>,
    );

    expect(handleGlobalKeypress).toBeDefined();

    // Trigger Ctrl+Z
    await act(async () => {
      handleGlobalKeypress({
        name: 'z',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
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

    // 6. Verify rerender key update (indirectly via App rerender? or just assume side effects)
    // We can't easily check state internal to component without hacking, but checking side effects is good enough.

    unmount();
  });
});
