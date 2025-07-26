/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from './App.js';
import { Config, ideContext } from '@google/gemini-cli-core';
import { LoadedSettings } from '../config/settings.js';
import { ThemeManager } from './themes/theme-manager.js';
import { UIContext } from './contexts/UIContext.js';
import { SessionStatsProvider } from './contexts/SessionContext.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actualCore = await importOriginal();
  const ConfigClassMock = vi.fn().mockImplementation((options) => ({
    ...options,
    getQuestion: vi.fn().mockReturnValue(options.question),
    getModel: vi.fn().mockReturnValue('test-model'),
    getHistory: vi.fn().mockReturnValue([]),
    getTools: vi.fn().mockReturnValue([]),
    getToolRegistry: vi.fn().mockReturnValue({}),
    getGeminiClient: vi.fn().mockReturnValue({
      getUserTier: vi.fn().mockResolvedValue('FREE'),
    }),
    subscribeToModelChanges: vi.fn().mockReturnValue(() => {}),
    getMcpServers: vi.fn().mockReturnValue({}),
    getBlockedMcpServers: vi.fn().mockReturnValue([]),
    getGeminiMdFileCount: vi.fn().mockReturnValue(0),
    getAllGeminiMdFilenames: vi.fn().mockReturnValue([]),
    getDebugMode: vi.fn().mockReturnValue(false),
    getAccessibility: vi.fn().mockReturnValue({}),
    getShowMemoryUsage: vi.fn().mockReturnValue(false),
    getProjectRoot: vi.fn().mockReturnValue('/test/dir'),
    setFlashFallbackHandler: vi.fn(),
    getVertexAI: vi.fn().mockReturnValue(false),
    getApprovalMode: vi.fn().mockReturnValue('auto'),
    getCoreTools: vi.fn().mockReturnValue([]),
    getFullContext: vi.fn().mockReturnValue(false),
    getTargetDir: vi.fn().mockReturnValue('/test/dir'),
    getUserAgent: vi.fn().mockReturnValue('test-agent'),
    getUserMemory: vi.fn().mockReturnValue(''),
    getSandbox: vi.fn().mockReturnValue(undefined),
    getEmbeddingModel: vi.fn().mockReturnValue('test-embedding-model'),
    getToolCallCommand: vi.fn().mockReturnValue(undefined),
    getToolDiscoveryCommand: vi.fn().mockReturnValue(undefined),
    getMcpServerCommand: vi.fn().mockReturnValue(undefined),
    getCheckpointingEnabled: vi.fn().mockReturnValue(true),
    getSessionId: vi.fn().mockReturnValue('test-session-id'),
    getIdeMode: vi.fn().mockReturnValue(false),
  }));

  return {
    ...actualCore,
    Config: ConfigClassMock,
    ideContext: {
      getOpenFilesContext: vi.fn(),
      subscribeToOpenFiles: vi.fn(() => vi.fn()),
    },
  };
});

describe('App', () => {
  let mockConfig;
  let mockSettings;
  let mockUiContext;

  beforeEach(() => {
    const MockedConfig = vi.mocked(Config, true);
    mockConfig = new MockedConfig({
      apiKey: 'test-key',
      model: 'gemini-1.5-flash-latest',
      cwd: '/tmp',
      sessionId: 'test-session',
    });

    mockSettings = new LoadedSettings(
      { path: '', settings: { theme: 'default' } },
      { path: '', settings: {} },
      { path: '', settings: {} },
      [],
    );

    mockUiContext = {
      openHelp: vi.fn(),
      openAuthDialog: vi.fn(),
      openThemeDialog: vi.fn(),
      openEditorDialog: vi.fn(),
      openPrivacyNotice: vi.fn(),
      toggleCorgiMode: vi.fn(),
      setDebugMessage: vi.fn(),
      quit: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    ThemeManager.resetInstance();
  });

  it('should render the app without crashing', async () => {
    const { lastFrame } = render(
      <SessionStatsProvider>
        <UIContext.Provider value={mockUiContext}>
          <App
            config={mockConfig}
            settings={mockSettings}
            version="0.0.0"
            history={[]}
            addItem={() => {}}
            clearItems={() => {}}
            loadHistory={() => {}}
            updateItem={() => {}}
            isThemeDialogOpen={false}
            themeError={null}
            handleThemeSelect={() => {}}
            handleThemeHighlight={() => {}}
            isAuthenticating={false}
            authError={null}
            cancelAuthentication={() => {}}
            isAuthDialogOpen={false}
            handleAuthSelect={() => {}}
            editorError={null}
            isEditorDialogOpen={false}
            handleEditorSelect={() => {}}
            exitEditorDialog={() => {}}
            showPrivacyNotice={false}
            setShowPrivacyNotice={() => {}}
            showHelp={false}
            corgiMode={false}
            debugMessage=""
            quittingMessages={null}
          />
        </UIContext.Provider>
      </SessionStatsProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(lastFrame()).toContain('Type your message');
  });

  it('should display active file when available', async () => {
    vi.mocked(ideContext.getOpenFilesContext).mockReturnValue({
      activeFile: '/path/to/my-file.ts',
      selectedText: 'hello',
    });

    const { lastFrame, unmount } = render(
      <SessionStatsProvider>
        <UIContext.Provider value={mockUiContext}>
          <App
            config={mockConfig}
            settings={mockSettings}
            version="0.0.0"
            history={[]}
            addItem={() => {}}
            clearItems={() => {}}
            loadHistory={() => {}}
            updateItem={() => {}}
            isThemeDialogOpen={false}
            themeError={null}
            handleThemeSelect={() => {}}
            handleThemeHighlight={() => {}}
            isAuthenticating={false}
            authError={null}
            cancelAuthentication={() => {}}
            isAuthDialogOpen={false}
            handleAuthSelect={() => {}}
            editorError={null}
            isEditorDialogOpen={false}
            handleEditorSelect={() => {}}
            exitEditorDialog={() => {}}
            showPrivacyNotice={false}
            setShowPrivacyNotice={() => {}}
            showHelp={false}
            corgiMode={false}
            debugMessage=""
            quittingMessages={null}
          />
        </UIContext.Provider>
      </SessionStatsProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(lastFrame()).toContain('my-file.ts');
    unmount();
  });
});
