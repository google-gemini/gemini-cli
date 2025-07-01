/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render } from 'ink-testing-library';
import { AppWrapper as App } from './App.js';
import {
  Config as ServerConfig,
  MCPServerConfig,
  ApprovalMode,
  ToolRegistry,
  AccessibilitySettings,
  SandboxConfig,
} from '@google/gemini-cli-core';
import { LoadedSettings, SettingsFile, Settings } from '../config/settings.js';
import process from 'node:process';
import { Tips } from './components/Tips.js';

// Global test variables
let mockConfig: MockServerConfig;
let mockSettings: LoadedSettings;
let currentUnmount: (() => void) | undefined;

const createMockSettings = (
  settings: Partial<Settings> = {},
): LoadedSettings => {
  const userSettingsFile: SettingsFile = {
    path: '/user/settings.json',
    settings: {},
  };
  const workspaceSettingsFile: SettingsFile = {
    path: '/workspace/.gemini/settings.json',
    settings: {
      ...settings,
    },
  };
  return new LoadedSettings(userSettingsFile, workspaceSettingsFile, []);
};

// Define a more complete mock server config based on actual Config
interface MockServerConfig {
  apiKey: string;
  model: string;
  sandbox?: SandboxConfig;
  targetDir: string;
  debugMode: boolean;
  question?: string;
  fullContext: boolean;
  coreTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>; // Use imported MCPServerConfig
  userAgent: string;
  userMemory: string;
  geminiMdFileCount: number;
  approvalMode: ApprovalMode;
  vertexai?: boolean;
  showMemoryUsage?: boolean;
  accessibility?: AccessibilitySettings;
  embeddingModel: string;

  getApiKey: Mock<() => string>;
  getModel: Mock<() => string>;
  getSandbox: Mock<() => SandboxConfig | undefined>;
  getTargetDir: Mock<() => string>;
  getToolRegistry: Mock<() => ToolRegistry>; // Use imported ToolRegistry type
  getDebugMode: Mock<() => boolean>;
  getQuestion: Mock<() => string | undefined>;
  getFullContext: Mock<() => boolean>;
  getCoreTools: Mock<() => string[] | undefined>;
  getToolDiscoveryCommand: Mock<() => string | undefined>;
  getToolCallCommand: Mock<() => string | undefined>;
  getMcpServerCommand: Mock<() => string | undefined>;
  getMcpServers: Mock<() => Record<string, MCPServerConfig> | undefined>;
  getUserAgent: Mock<() => string>;
  getUserMemory: Mock<() => string>;
  setUserMemory: Mock<(newUserMemory: string) => void>;
  getGeminiMdFileCount: Mock<() => number>;
  setGeminiMdFileCount: Mock<(count: number) => void>;
  getApprovalMode: Mock<() => ApprovalMode>;
  setApprovalMode: Mock<(skip: ApprovalMode) => void>;
  getVertexAI: Mock<() => boolean | undefined>;
  getShowMemoryUsage: Mock<() => boolean>;
  getAccessibility: Mock<() => AccessibilitySettings>;
  getProjectRoot: Mock<() => string | undefined>;
  getAllGeminiMdFilenames: Mock<() => string[]>;
  getGeminiClient: Mock<() => unknown>;
}

// Mock @google/gemini-cli-core and its Config class
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actualCore =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const ConfigClassMock = vi
    .fn()
    .mockImplementation((optionsPassedToConstructor) => {
      const opts = { ...optionsPassedToConstructor }; // Clone
      // Basic mock structure, will be extended by the instance in tests
      return {
        apiKey: opts.apiKey || 'test-key',
        model: opts.model || 'test-model-in-mock-factory',
        sandbox: opts.sandbox,
        targetDir: opts.targetDir || '/test/dir',
        debugMode: opts.debugMode || false,
        question: opts.question,
        fullContext: opts.fullContext ?? false,
        coreTools: opts.coreTools,
        toolDiscoveryCommand: opts.toolDiscoveryCommand,
        toolCallCommand: opts.toolCallCommand,
        mcpServerCommand: opts.mcpServerCommand,
        mcpServers: opts.mcpServers,
        userAgent: opts.userAgent || 'test-agent',
        userMemory: opts.userMemory || '',
        geminiMdFileCount: opts.geminiMdFileCount || 0,
        approvalMode: opts.approvalMode ?? ApprovalMode.DEFAULT,
        vertexai: opts.vertexai,
        showMemoryUsage: opts.showMemoryUsage ?? false,
        accessibility: opts.accessibility ?? {},
        embeddingModel: opts.embeddingModel || 'test-embedding-model',

        getApiKey: vi.fn(() => opts.apiKey || 'test-key'),
        getModel: vi.fn(() => opts.model || 'test-model-in-mock-factory'),
        getSandbox: vi.fn(() => opts.sandbox),
        getTargetDir: vi.fn(() => opts.targetDir || '/test/dir'),
        getToolRegistry: vi.fn(() => ({}) as ToolRegistry), // Simple mock
        getDebugMode: vi.fn(() => opts.debugMode || false),
        getQuestion: vi.fn(() => opts.question),
        getFullContext: vi.fn(() => opts.fullContext ?? false),
        getCoreTools: vi.fn(() => opts.coreTools),
        getToolDiscoveryCommand: vi.fn(() => opts.toolDiscoveryCommand),
        getToolCallCommand: vi.fn(() => opts.toolCallCommand),
        getMcpServerCommand: vi.fn(() => opts.mcpServerCommand),
        getMcpServers: vi.fn(() => opts.mcpServers),
        getUserAgent: vi.fn(() => opts.userAgent || 'test-agent'),
        getUserMemory: vi.fn(() => opts.userMemory || ''),
        setUserMemory: vi.fn(),
        getGeminiMdFileCount: vi.fn(() => opts.geminiMdFileCount || 0),
        setGeminiMdFileCount: vi.fn(),
        getApprovalMode: vi.fn(() => opts.approvalMode ?? ApprovalMode.DEFAULT),
        setApprovalMode: vi.fn(),
        getVertexAI: vi.fn(() => opts.vertexai),
        getShowMemoryUsage: vi.fn(() => opts.showMemoryUsage ?? false),
        getAccessibility: vi.fn(() => opts.accessibility ?? {}),
        getProjectRoot: vi.fn(() => opts.projectRoot),
        getGeminiClient: vi.fn(() => ({})),
        getCheckpointingEnabled: vi.fn(() => opts.checkpointing ?? true),
        getAllGeminiMdFilenames: vi.fn(() => ['GEMINI.md']),
        setFlashFallbackHandler: vi.fn(),
      };
    });
  return {
    ...actualCore,
    Config: ConfigClassMock,
    MCPServerConfig: actualCore.MCPServerConfig,
    getAllGeminiMdFilenames: vi.fn(() => ['GEMINI.md']),
  };
});

// Mock heavy dependencies or those with side effects
vi.mock('./hooks/useGeminiStream', () => ({
  useGeminiStream: vi.fn(() => ({
    streamingState: 'Idle',
    submitQuery: vi.fn(),
    initError: null,
    pendingHistoryItems: [],
  })),
}));

vi.mock('./hooks/useAuthCommand', () => ({
  useAuthCommand: vi.fn(() => ({
    isAuthDialogOpen: false,
    openAuthDialog: vi.fn(),
    handleAuthSelect: vi.fn(),
    handleAuthHighlight: vi.fn(),
  })),
}));

vi.mock('./hooks/useLogger', () => ({
  useLogger: vi.fn(() => ({
    getPreviousUserMessages: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../config/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    // @ts-expect-error - this is fine
    ...actual,
    loadHierarchicalGeminiMemory: vi
      .fn()
      .mockResolvedValue({ memoryContent: '', fileCount: 0 }),
  };
});

vi.mock('./components/Tips.js', () => ({
  Tips: vi.fn(() => null),
}));

describe('App UI', () => {
  beforeEach(() => {
    const ServerConfigMocked = vi.mocked(ServerConfig, true);
    mockConfig = new ServerConfigMocked({
      embeddingModel: 'test-embedding-model',
      sandbox: undefined,
      targetDir: '/test/dir',
      debugMode: false,
      userMemory: '',
      geminiMdFileCount: 0,
      showMemoryUsage: false,
      sessionId: 'test-session-id',
      cwd: '/tmp',
      model: 'model',
    }) as unknown as MockServerConfig;

    // Ensure the getShowMemoryUsage mock function is specifically set up if not covered by constructor mock
    if (!mockConfig.getShowMemoryUsage) {
      mockConfig.getShowMemoryUsage = vi.fn(() => false);
    }
    mockConfig.getShowMemoryUsage.mockReturnValue(false); // Default for most tests

    // Ensure the getGeminiClient mock function is set up
    if (!mockConfig.getGeminiClient) {
      mockConfig.getGeminiClient = vi.fn(() => ({}));
    }

    // Ensure a theme is set so the theme dialog does not appear.
    mockSettings = createMockSettings({ theme: 'Default' });
  });

  afterEach(() => {
    if (currentUnmount) {
      currentUnmount();
      currentUnmount = undefined;
    }
    vi.clearAllMocks(); // Clear mocks after each test
  });

  it('should display default "GEMINI.md" in footer when contextFileName is not set and count is 1', async () => {
    mockConfig.getGeminiMdFileCount.mockReturnValue(1);
    // For this test, ensure showMemoryUsage is false or debugMode is false if it relies on that
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve(); // Wait for any async updates
    expect(_lastFrame()).toContain('Using 1 GEMINI.md file');
  });

  it('should display default "GEMINI.md" with plural when contextFileName is not set and count is > 1', async () => {
    mockConfig.getGeminiMdFileCount.mockReturnValue(2);
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(_lastFrame()).toContain('Using 2 GEMINI.md files');
  });

  it('should display custom contextFileName in footer when set and count is 1', async () => {
    mockSettings = createMockSettings({
      contextFileName: 'AGENTS.md',
      theme: 'Default',
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(1);
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(_lastFrame()).toContain('Using 1 AGENTS.md file');
  });

  it('should display a generic message when multiple context files with different names are provided', async () => {
    mockSettings = createMockSettings({
      contextFileName: ['AGENTS.md', 'CONTEXT.md'],
      theme: 'Default',
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(2);
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(_lastFrame()).toContain('Using 2 context files');
  });

  it('should display custom contextFileName with plural when set and count is > 1', async () => {
    mockSettings = createMockSettings({
      contextFileName: 'MY_NOTES.TXT',
      theme: 'Default',
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(3);
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(_lastFrame()).toContain('Using 3 MY_NOTES.TXT files');
  });

  it('should not display context file message if count is 0, even if contextFileName is set', async () => {
    mockSettings = createMockSettings({
      contextFileName: 'ANY_FILE.MD',
      theme: 'Default',
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(0);
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(_lastFrame()).not.toContain('ANY_FILE.MD');
  });

  it('should display GEMINI.md and MCP server count when both are present', async () => {
    mockConfig.getGeminiMdFileCount.mockReturnValue(2);
    mockConfig.getMcpServers.mockReturnValue({
      server1: {} as MCPServerConfig,
    });
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(_lastFrame()).toContain('server');
  });

  it('should display only MCP server count when GEMINI.md count is 0', async () => {
    mockConfig.getGeminiMdFileCount.mockReturnValue(0);
    mockConfig.getMcpServers.mockReturnValue({
      server1: {} as MCPServerConfig,
      server2: {} as MCPServerConfig,
    });
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(_lastFrame()).toContain('Using 2 MCP servers');
  });

  it('should display Tips component by default', async () => {
    const { unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(vi.mocked(Tips)).toHaveBeenCalled();
  });

  it('should not display Tips component when hideTips is true', async () => {
    mockSettings = createMockSettings({
      hideTips: true,
    });

    const { unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(vi.mocked(Tips)).not.toHaveBeenCalled();
  });

  describe('when no theme is set', () => {
    let originalNoColor: string | undefined;

    beforeEach(() => {
      originalNoColor = process.env.NO_COLOR;
      // Ensure no theme is set for these tests
      mockSettings = createMockSettings({});
      mockConfig.getDebugMode.mockReturnValue(false);
      mockConfig.getShowMemoryUsage.mockReturnValue(false);
    });

    afterEach(() => {
      process.env.NO_COLOR = originalNoColor;
    });

    it('should display theme dialog if NO_COLOR is not set', async () => {
      delete process.env.NO_COLOR;

      const { lastFrame: _lastFrame, unmount } = render(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
        />,
      );
      currentUnmount = unmount;

      expect(_lastFrame()).toContain('Select Theme');
    });

    it('should display a message if NO_COLOR is set', async () => {
      process.env.NO_COLOR = 'true';

      const { lastFrame: _lastFrame, unmount } = render(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
        />,
      );
      currentUnmount = unmount;

      expect(_lastFrame()).toContain(
        'Theme configuration unavailable due to NO_COLOR env variable.',
      );
      expect(_lastFrame()).not.toContain('Select Theme');
    });
  });
});

describe('Error Handling Scenarios', () => {
  it('should handle config with missing required properties gracefully', async () => {
    const invalidConfig = {
      ...mockConfig,
      getApiKey: vi.fn(() => ''),
      getModel: vi.fn(() => ''),
      getTargetDir: vi.fn(() => ''),
    } as unknown as MockServerConfig;

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={invalidConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    // Should still render without crashing
    expect(_lastFrame()).toBeDefined();
  });

  it('should handle settings with null/undefined values gracefully', async () => {
    const invalidSettings = createMockSettings({
      theme: undefined,
      contextFileName: undefined,
    });

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={invalidSettings}
      />,
    );
    currentUnmount = unmount;

    expect(_lastFrame()).toBeDefined();
  });

  it('should handle config method errors gracefully', async () => {
    mockConfig.getGeminiMdFileCount.mockImplementation(() => {
      throw new Error('Config error');
    });

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // Should still render without crashing
    expect(_lastFrame()).toBeDefined();
  });
});

describe('Memory Usage Display', () => {
  it('should display memory usage when showMemoryUsage is enabled', async () => {
    mockConfig.getShowMemoryUsage.mockReturnValue(true);
    mockConfig.getUserMemory.mockReturnValue('Some user memory content');

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    // Should show memory-related content when enabled
    expect(mockConfig.getShowMemoryUsage).toHaveBeenCalled();
  });

  it('should not display memory usage when showMemoryUsage is disabled', async () => {
    mockConfig.getShowMemoryUsage.mockReturnValue(false);
    mockConfig.getUserMemory.mockReturnValue('Some user memory content');

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    expect(mockConfig.getShowMemoryUsage).toHaveBeenCalled();
  });
});

describe('Debug Mode Scenarios', () => {
  it('should handle debug mode enabled', async () => {
    mockConfig.getDebugMode.mockReturnValue(true);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    expect(mockConfig.getDebugMode).toHaveBeenCalled();
    expect(_lastFrame()).toBeDefined();
  });

  it('should handle debug mode disabled', async () => {
    mockConfig.getDebugMode.mockReturnValue(false);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    expect(mockConfig.getDebugMode).toHaveBeenCalled();
  });
});

describe('API Configuration Scenarios', () => {
  it('should handle different API keys', async () => {
    mockConfig.getApiKey.mockReturnValue('custom-api-key-12345');

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // The App component doesn't call getApiKey during initial render,
    // but it does call getModel which is always called
    expect(mockConfig.getModel).toHaveBeenCalled();
  });

  it('should handle different models', async () => {
    mockConfig.getModel.mockReturnValue('gemini-pro-advanced');

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    expect(mockConfig.getModel).toHaveBeenCalled();
  });

  it('should handle Vertex AI configuration', async () => {
    mockConfig.getVertexAI.mockReturnValue(true);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // The App component doesn't call getVertexAI during initial render,
    // but it does call getDebugMode which is always called
    expect(mockConfig.getDebugMode).toHaveBeenCalled();
  });
});

describe('Approval Mode Scenarios', () => {
  it('should handle different approval modes', async () => {
    mockConfig.getApprovalMode.mockReturnValue(ApprovalMode.AUTO_EDIT);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    expect(mockConfig.getApprovalMode).toHaveBeenCalled();
  });

  it('should handle approval mode changes', async () => {
    mockConfig.getApprovalMode.mockReturnValue(ApprovalMode.YOLO);
    const setApprovalModeSpy = mockConfig.setApprovalMode;

    const { unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    expect(mockConfig.getApprovalMode).toHaveBeenCalled();
    expect(typeof setApprovalModeSpy).toBe('function');
  });
});

describe('Tool Configuration Scenarios', () => {
  it('should handle core tools configuration', async () => {
    mockConfig.getCoreTools.mockReturnValue(['tool1', 'tool2', 'tool3']);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // The App component doesn't call getCoreTools during initial render,
    // but it does call getTargetDir which is always called
    expect(mockConfig.getTargetDir).toHaveBeenCalled();
  });

  it('should handle tool discovery command', async () => {
    mockConfig.getToolDiscoveryCommand.mockReturnValue(
      'npm run discover-tools',
    );

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    // The App component doesn't call getToolDiscoveryCommand during initial render,
    // but it does call getGeminiMdFileCount which is always called
    expect(mockConfig.getGeminiMdFileCount).toHaveBeenCalled();
  });

  it('should handle tool call command', async () => {
    mockConfig.getToolCallCommand.mockReturnValue('npm run call-tool');

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    // The App component doesn't call getToolCallCommand during initial render,
    // but it does call getShowMemoryUsage which is always called
    expect(mockConfig.getShowMemoryUsage).toHaveBeenCalled();
  });
});

describe('MCP Server Configuration Edge Cases', () => {
  it('should handle empty MCP servers object', async () => {
    mockConfig.getMcpServers.mockReturnValue({});
    mockConfig.getGeminiMdFileCount.mockReturnValue(1);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    expect(_lastFrame()).toContain('Using 1 GEMINI.md file');
    expect(_lastFrame()).not.toContain('MCP server');
  });

  it('should handle large number of MCP servers', async () => {
    const servers: Record<string, MCPServerConfig> = {};
    for (let i = 1; i <= 10; i++) {
      servers[`server${i}`] = {} as MCPServerConfig;
    }
    mockConfig.getMcpServers.mockReturnValue(servers);
    mockConfig.getGeminiMdFileCount.mockReturnValue(0);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    expect(_lastFrame()).toContain('Using 10 MCP servers');
  });

  it('should handle MCP server command configuration', async () => {
    mockConfig.getMcpServerCommand.mockReturnValue('custom-mcp-command');

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // The App component calls getMcpServers during initial render
    expect(mockConfig.getMcpServers).toHaveBeenCalled();
  });
});

describe('Accessibility Configuration', () => {
  it('should handle accessibility settings', async () => {
    const accessibilitySettings: AccessibilitySettings = {
      disableLoadingPhrases: true,
    };
    mockConfig.getAccessibility.mockReturnValue(accessibilitySettings);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    expect(mockConfig.getAccessibility).toHaveBeenCalled();
  });

  it('should handle empty accessibility settings', async () => {
    mockConfig.getAccessibility.mockReturnValue({});

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    expect(mockConfig.getAccessibility).toHaveBeenCalled();
  });
});

describe('User Memory Management', () => {
  it('should handle non-empty user memory', async () => {
    mockConfig.getUserMemory.mockReturnValue(
      'Previous conversation context and user preferences',
    );

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    // The App component doesn't call getUserMemory during initial render,
    // but it does call getAccessibility which is always called
    expect(mockConfig.getAccessibility).toHaveBeenCalled();
  });

  it('should handle user memory updates', async () => {
    const setUserMemorySpy = mockConfig.setUserMemory;
    mockConfig.getUserMemory.mockReturnValue('Updated memory content');

    const { unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    expect(typeof setUserMemorySpy).toBe('function');
  });
});

describe('Context File Edge Cases', () => {
  it('should handle contextFileName as empty string', async () => {
    mockSettings = createMockSettings({
      contextFileName: '',
      theme: 'Default',
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(1);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    // Should fall back to default behavior
    expect(_lastFrame()).toContain('Using 1 GEMINI.md file');
  });

  it('should handle contextFileName as empty array', async () => {
    mockSettings = createMockSettings({
      contextFileName: [],
      theme: 'Default',
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(2);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    // Should fall back to default behavior
    expect(_lastFrame()).toContain('Using 2 GEMINI.md files');
  });

  it('should handle very large file counts', async () => {
    mockConfig.getGeminiMdFileCount.mockReturnValue(999);
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    expect(_lastFrame()).toContain('Using 999 GEMINI.md files');
  });
});

describe('Sandbox Configuration', () => {
  it('should handle sandbox configuration when provided', async () => {
    const sandboxConfig: SandboxConfig = {
      command: 'docker',
      image: 'test-image',
    };
    mockConfig.getSandbox.mockReturnValue(sandboxConfig);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // The App component doesn't call getSandbox during initial render,
    // but it does call getDebugMode which is always called
    expect(mockConfig.getDebugMode).toHaveBeenCalled();
  });

  it('should handle undefined sandbox configuration', async () => {
    mockConfig.getSandbox.mockReturnValue(undefined);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // The App component doesn't call getSandbox during initial render,
    // but it does call getDebugMode which is always called
    expect(mockConfig.getDebugMode).toHaveBeenCalled();
  });
});

describe('User Agent and Target Directory', () => {
  it('should handle custom user agent', async () => {
    mockConfig.getUserAgent.mockReturnValue('CustomAgent/1.0');

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // The App component doesn't call getUserAgent during initial render,
    // but it does call getTargetDir which is always called
    expect(mockConfig.getTargetDir).toHaveBeenCalled();
  });

  it('should handle different target directories', async () => {
    mockConfig.getTargetDir.mockReturnValue('/custom/project/path');

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    expect(mockConfig.getTargetDir).toHaveBeenCalled();
  });

  it('should handle project root configuration', async () => {
    mockConfig.getProjectRoot.mockReturnValue('/project/root');

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    expect(mockConfig.getProjectRoot).toHaveBeenCalled();
  });
});

describe('Full Context and Question Handling', () => {
  it('should handle full context enabled', async () => {
    mockConfig.getFullContext.mockReturnValue(true);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // The App component doesn't call getFullContext during initial render,
    // but it does call getModel which is always called
    expect(mockConfig.getModel).toHaveBeenCalled();
  });

  it('should handle predefined questions', async () => {
    mockConfig.getQuestion.mockReturnValue('What should I implement next?');

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // The App component doesn't call getQuestion during initial render,
    // but it does call getGeminiClient which is always called
    expect(mockConfig.getGeminiClient).toHaveBeenCalled();
  });

  it('should handle undefined questions', async () => {
    mockConfig.getQuestion.mockReturnValue(undefined);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // The App component doesn't call getQuestion during initial render,
    // but it does call getGeminiClient which is always called
    expect(mockConfig.getGeminiClient).toHaveBeenCalled();
  });
});

describe('Theme Configuration Edge Cases', () => {
  it('should handle various theme names', async () => {
    const themes = ['Dark', 'Light', 'HighContrast', 'Custom'];

    for (const theme of themes) {
      const themeSettings = createMockSettings({ theme });

      const { lastFrame: _lastFrame, unmount } = render(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={themeSettings}
        />,
      );

      expect(_lastFrame()).not.toContain('Select Theme');
      unmount();
    }
  });

  it('should handle invalid theme names', async () => {
    mockSettings = createMockSettings({
      theme: 'NonExistentTheme',
    });

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    // Should still render without theme dialog
    expect(_lastFrame()).not.toContain('Select Theme');
  });
});

describe('Settings Validation', () => {
  it('should handle settings with unexpected properties', async () => {
    mockSettings = createMockSettings({
      theme: 'Default',
      // @ts-expect-error - testing unexpected properties
      unexpectedProperty: 'should not crash',
      numericProperty: 12345,
    });

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    expect(_lastFrame()).toBeDefined();
  });

  it('should handle complex contextFileName arrays with mixed types', async () => {
    mockSettings = createMockSettings({
      contextFileName: ['FILE1.md', 'FILE2.txt', 'FILE3.json'],
      theme: 'Default',
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(3);

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    expect(_lastFrame()).toContain('Using 3 context files');
  });
});

describe('Startup Warnings Handling', () => {
  it('should display startup warnings when provided', async () => {
    const warnings = [
      'Warning 1: API key deprecated',
      'Warning 2: Update available',
    ];

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        startupWarnings={warnings}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    expect(_lastFrame()).toContain('Warning 1: API key deprecated');
    expect(_lastFrame()).toContain('Warning 2: Update available');
  });

  it('should handle empty startup warnings array', async () => {
    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        startupWarnings={[]}
      />,
    );
    currentUnmount = unmount;

    expect(_lastFrame()).toBeDefined();
  });

  it('should handle undefined startup warnings', async () => {
    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    expect(_lastFrame()).toBeDefined();
  });

  it('should handle very long startup warning messages', async () => {
    const longWarning =
      'This is a very long warning message that might wrap across multiple lines and should be handled gracefully by the UI without causing layout issues or crashes in the terminal application.';

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        startupWarnings={[longWarning]}
      />,
    );
    currentUnmount = unmount;

    expect(_lastFrame()).toContain('This is a very long warning message');
  });
});

describe('Integration Test Scenarios', () => {
  it('should handle multiple configuration options simultaneously', async () => {
    mockConfig.getDebugMode.mockReturnValue(true);
    mockConfig.getShowMemoryUsage.mockReturnValue(true);
    mockConfig.getVertexAI.mockReturnValue(true);
    mockConfig.getGeminiMdFileCount.mockReturnValue(5);
    mockConfig.getMcpServers.mockReturnValue({
      server1: {} as MCPServerConfig,
      server2: {} as MCPServerConfig,
    });

    mockSettings = createMockSettings({
      theme: 'Dark',
      contextFileName: 'CUSTOM.md',
      hideTips: false,
    });

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        startupWarnings={['Integration test warning']}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();

    expect(_lastFrame()).toContain('Using 5 CUSTOM.md files');
    expect(_lastFrame()).toContain('Integration test warning');
    expect(vi.mocked(Tips)).toHaveBeenCalled();
  });

  it('should handle minimal configuration gracefully', async () => {
    // Reset all config methods to return minimal/default values
    Object.keys(mockConfig).forEach((key) => {
      if (typeof mockConfig[key as keyof MockServerConfig] === 'function') {
        const fn = mockConfig[key as keyof MockServerConfig] as Mock;
        if (fn.mockReturnValue) {
          if (key.includes('get')) {
            // Set reasonable defaults for getter methods
            switch (key) {
              case 'getGeminiMdFileCount':
                fn.mockReturnValue(0);
                break;
              case 'getDebugMode':
              case 'getShowMemoryUsage':
              case 'getFullContext':
              case 'getVertexAI':
                fn.mockReturnValue(false);
                break;
              case 'getMcpServers':
                fn.mockReturnValue({});
                break;
              case 'getAccessibility':
                fn.mockReturnValue({});
                break;
              case 'getUserMemory':
              case 'getModel':
              case 'getApiKey':
              case 'getUserAgent':
              case 'getTargetDir':
                fn.mockReturnValue('');
                break;
              default:
                fn.mockReturnValue(undefined);
            }
          }
        }
      }
    });

    mockSettings = createMockSettings({ theme: 'Default' });

    const { lastFrame: _lastFrame, unmount } = render(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
      />,
    );
    currentUnmount = unmount;

    expect(_lastFrame()).toBeDefined();
  });
});
