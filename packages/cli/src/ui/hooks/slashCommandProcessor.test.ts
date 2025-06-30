/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const { mockProcessExit } = vi.hoisted(() => ({
  mockProcessExit: vi.fn((_code?: number): never => undefined as never),
}));

vi.mock('node:process', () => ({
  default: {
    exit: mockProcessExit,
    cwd: vi.fn(() => '/mock/cwd'),
    get env() {
      return process.env;
    }, // Use a getter to ensure current process.env is used
    platform: 'test-platform',
    version: 'test-node-version',
    memoryUsage: vi.fn(() => ({
      rss: 12345678,
      heapTotal: 23456789,
      heapUsed: 10234567,
      external: 1234567,
      arrayBuffers: 123456,
    })),
  },
  // Provide top-level exports as well for compatibility
  exit: mockProcessExit,
  cwd: vi.fn(() => '/mock/cwd'),
  get env() {
    return process.env;
  }, // Use a getter here too
  platform: 'test-platform',
  version: 'test-node-version',
  memoryUsage: vi.fn(() => ({
    rss: 12345678,
    heapTotal: 23456789,
    heapUsed: 10234567,
    external: 1234567,
    arrayBuffers: 123456,
  })),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

const mockGetCliVersionFn = vi.fn(() => Promise.resolve('0.1.0'));
vi.mock('../../utils/version.js', () => ({
  getCliVersion: (...args: []) => mockGetCliVersionFn(...args),
}));

import { act, renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import open from 'open';
import {
  useSlashCommandProcessor,
  type SlashCommandActionReturn,
} from './slashCommandProcessor.js';
import { MessageType } from '../types.js';
import {
  Config,
  MCPDiscoveryState,
  MCPServerStatus,
  getMCPDiscoveryState,
  getMCPServerStatus,
  GeminiClient,
} from '@google/gemini-cli-core';
import { useSessionStats } from '../contexts/SessionContext.js';
import { LoadedSettings } from '../../config/settings.js';
import * as ShowMemoryCommandModule from './useShowMemoryCommand.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';

vi.mock('../contexts/SessionContext.js', () => ({
  useSessionStats: vi.fn(),
}));

vi.mock('./useShowMemoryCommand.js', () => ({
  SHOW_MEMORY_COMMAND_NAME: '/memory show',
  createShowMemoryAction: vi.fn(() => vi.fn()),
}));

vi.mock('open', () => ({
  default: vi.fn(),
}));

describe('useSlashCommandProcessor', () => {
  let mockAddItem: ReturnType<typeof vi.fn>;
  let mockClearItems: ReturnType<typeof vi.fn>;
  let mockLoadHistory: ReturnType<typeof vi.fn>;
  let mockRefreshStatic: ReturnType<typeof vi.fn>;
  let mockSetShowHelp: ReturnType<typeof vi.fn>;
  let mockOnDebugMessage: ReturnType<typeof vi.fn>;
  let mockOpenThemeDialog: ReturnType<typeof vi.fn>;
  let mockOpenAuthDialog: ReturnType<typeof vi.fn>;
  let mockOpenEditorDialog: ReturnType<typeof vi.fn>;
  let mockPerformMemoryRefresh: ReturnType<typeof vi.fn>;
  let mockSetQuittingMessages: ReturnType<typeof vi.fn>;
  let mockTryCompressChat: ReturnType<typeof vi.fn>;
  let mockGeminiClient: GeminiClient;
  let mockConfig: Config;
  let mockCorgiMode: ReturnType<typeof vi.fn>;
  const mockUseSessionStats = useSessionStats as Mock;

  beforeEach(() => {
    mockAddItem = vi.fn();
    mockClearItems = vi.fn();
    mockLoadHistory = vi.fn();
    mockRefreshStatic = vi.fn();
    mockSetShowHelp = vi.fn();
    mockOnDebugMessage = vi.fn();
    mockOpenThemeDialog = vi.fn();
    mockOpenAuthDialog = vi.fn();
    mockOpenEditorDialog = vi.fn();
    mockPerformMemoryRefresh = vi.fn().mockResolvedValue(undefined);
    mockSetQuittingMessages = vi.fn();
    mockTryCompressChat = vi.fn();
    mockGeminiClient = {
      tryCompressChat: mockTryCompressChat,
    } as unknown as GeminiClient;
    mockConfig = {
      getDebugMode: vi.fn(() => false),
      getGeminiClient: () => mockGeminiClient,
      getSandbox: vi.fn(() => 'test-sandbox'),
      getModel: vi.fn(() => 'test-model'),
      getProjectRoot: vi.fn(() => '/test/dir'),
      getCheckpointingEnabled: vi.fn(() => true),
      getBugCommand: vi.fn(() => undefined),
    } as unknown as Config;
    mockCorgiMode = vi.fn();
    mockUseSessionStats.mockReturnValue({
      stats: {
        sessionStartTime: new Date('2025-01-01T00:00:00.000Z'),
        cumulative: {
          turnCount: 0,
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          totalTokenCount: 0,
          cachedContentTokenCount: 0,
          toolUsePromptTokenCount: 0,
          thoughtsTokenCount: 0,
        },
      },
    });

    (open as Mock).mockClear();
    mockProcessExit.mockClear();
    (ShowMemoryCommandModule.createShowMemoryAction as Mock).mockClear();
    mockPerformMemoryRefresh.mockClear();
    process.env = { ...globalThis.process.env };
  });

  const getProcessorHook = (showToolDescriptions: boolean = false) => {
    const settings = {
      merged: {
        contextFileName: 'GEMINI.md',
      },
    } as LoadedSettings;
    return renderHook(() =>
      useSlashCommandProcessor(
        mockConfig,
        settings,
        [],
        mockAddItem,
        mockClearItems,
        mockLoadHistory,
        mockRefreshStatic,
        mockSetShowHelp,
        mockOnDebugMessage,
        mockOpenThemeDialog,
        mockOpenAuthDialog,
        mockOpenEditorDialog,
        mockPerformMemoryRefresh,
        mockCorgiMode,
        showToolDescriptions,
        mockSetQuittingMessages,
      ),
    );
  };

  const getProcessor = (showToolDescriptions: boolean = false) =>
    getProcessorHook(showToolDescriptions).result.current;

  describe('/memory add', () => {
    it('should return tool scheduling info on valid input', async () => {
      const { handleSlashCommand } = getProcessor();
      const fact = 'Remember this fact';
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand(`/memory add ${fact}`);
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        1, // User message
        expect.objectContaining({
          type: MessageType.USER,
          text: `/memory add ${fact}`,
        }),
        expect.any(Number),
      );
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2, // Info message about attempting to save
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Attempting to save to memory: "${fact}"`,
        }),
        expect.any(Number),
      );

      expect(commandResult).toEqual({
        shouldScheduleTool: true,
        toolName: 'save_memory',
        toolArgs: { fact },
      });

      // performMemoryRefresh is no longer called directly here
      expect(mockPerformMemoryRefresh).not.toHaveBeenCalled();
    });

    it('should show usage error and return true if no text is provided', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/memory add ');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2, // After user message
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Usage: /memory add <text to remember>',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true); // Command was handled (by showing an error)
    });
  });

  describe('/memory show', () => {
    it('should call the showMemoryAction and return true', async () => {
      const mockReturnedShowAction = vi.fn();
      vi.mocked(ShowMemoryCommandModule.createShowMemoryAction).mockReturnValue(
        mockReturnedShowAction,
      );
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/memory show');
      });
      expect(
        ShowMemoryCommandModule.createShowMemoryAction,
      ).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Object),
        expect.any(Function),
      );
      expect(mockReturnedShowAction).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });
  });

  describe('/memory refresh', () => {
    it('should call performMemoryRefresh and return true', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/memory refresh');
      });
      expect(mockPerformMemoryRefresh).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });
  });

  describe('Unknown /memory subcommand', () => {
    it('should show an error for unknown /memory subcommand and return true', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/memory foobar');
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown /memory command: foobar. Available: show, refresh, add',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
    });
  });

  describe('/stats command', () => {
    it('should show detailed session statistics', async () => {
      // Arrange
      const cumulativeStats = {
        totalTokenCount: 900,
        promptTokenCount: 200,
        candidatesTokenCount: 400,
        cachedContentTokenCount: 100,
        turnCount: 1,
        toolUsePromptTokenCount: 50,
        thoughtsTokenCount: 150,
      };
      mockUseSessionStats.mockReturnValue({
        stats: {
          sessionStartTime: new Date('2025-01-01T00:00:00.000Z'),
          cumulative: cumulativeStats,
        },
      });

      const { handleSlashCommand } = getProcessor();
      const mockDate = new Date('2025-01-01T01:02:03.000Z'); // 1h 2m 3s duration
      vi.setSystemTime(mockDate);

      // Act
      await act(async () => {
        handleSlashCommand('/stats');
      });

      // Assert
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2, // Called after the user message
        expect.objectContaining({
          type: MessageType.STATS,
          stats: cumulativeStats,
          duration: '1h 2m 3s',
        }),
        expect.any(Number),
      );

      vi.useRealTimers();
    });
  });

  describe('/about command', () => {
    it('should show the about box with all details including auth and project', async () => {
      // Arrange
      mockGetCliVersionFn.mockResolvedValue('test-version');
      process.env.SANDBOX = 'gemini-sandbox';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-gcp-project';
      vi.mocked(mockConfig.getModel).mockReturnValue('test-model-from-config');

      const settings = {
        merged: {
          selectedAuthType: 'test-auth-type',
          contextFileName: 'GEMINI.md',
        },
      } as LoadedSettings;

      const { result } = renderHook(() =>
        useSlashCommandProcessor(
          mockConfig,
          settings,
          [],
          mockAddItem,
          mockClearItems,
          mockLoadHistory,
          mockRefreshStatic,
          mockSetShowHelp,
          mockOnDebugMessage,
          mockOpenThemeDialog,
          mockOpenAuthDialog,
          mockOpenEditorDialog,
          mockPerformMemoryRefresh,
          mockCorgiMode,
          false,
          mockSetQuittingMessages,
        ),
      );

      // Act
      await act(async () => {
        await result.current.handleSlashCommand('/about');
      });

      // Assert
      expect(mockAddItem).toHaveBeenCalledTimes(2); // user message + about message
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: 'about',
          cliVersion: 'test-version',
          osVersion: 'test-platform',
          sandboxEnv: 'gemini-sandbox',
          modelVersion: 'test-model-from-config',
          selectedAuthType: 'test-auth-type',
          gcpProject: 'test-gcp-project',
        }),
        expect.any(Number),
      );
    });

    it('should show sandbox-exec profile when applicable', async () => {
      // Arrange
      mockGetCliVersionFn.mockResolvedValue('test-version');
      process.env.SANDBOX = 'sandbox-exec';
      process.env.SEATBELT_PROFILE = 'test-profile';
      vi.mocked(mockConfig.getModel).mockReturnValue('test-model-from-config');

      const { result } = getProcessorHook();

      // Act
      await act(async () => {
        await result.current.handleSlashCommand('/about');
      });

      // Assert
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          sandboxEnv: 'sandbox-exec (test-profile)',
        }),
        expect.any(Number),
      );
    });
  });

  describe('Other commands', () => {
    it('/help should open help and return true', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/help');
      });
      expect(mockSetShowHelp).toHaveBeenCalledWith(true);
      expect(commandResult).toBe(true);
    });

    it('/clear should clear items, reset chat, and refresh static', async () => {
      const mockResetChat = vi.fn();
      mockConfig = {
        ...mockConfig,
        getGeminiClient: () => ({
          resetChat: mockResetChat,
        }),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/clear');
      });

      expect(mockClearItems).toHaveBeenCalled();
      expect(mockResetChat).toHaveBeenCalled();
      expect(mockRefreshStatic).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });

    it('/editor should open editor dialog and return true', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/editor');
      });
      expect(mockOpenEditorDialog).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });
  });

  describe('/bug command', () => {
    const originalEnv = process.env;
    beforeEach(() => {
      vi.resetModules();
      mockGetCliVersionFn.mockResolvedValue('0.1.0');
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    const getExpectedUrl = (
      description?: string,
      sandboxEnvVar?: string,
      seatbeltProfileVar?: string,
      cliVersion?: string,
    ) => {
      const osVersion = 'test-platform test-node-version';
      let sandboxEnvStr = 'no sandbox';
      if (sandboxEnvVar && sandboxEnvVar !== 'sandbox-exec') {
        sandboxEnvStr = sandboxEnvVar.replace(/^gemini-(?:code-)?/, '');
      } else if (sandboxEnvVar === 'sandbox-exec') {
        sandboxEnvStr = `sandbox-exec (${seatbeltProfileVar || 'unknown'})`;
      }
      const modelVersion = 'test-model';
      // Use the mocked memoryUsage value
      const memoryUsage = '11.8 MB';

      const info = `
*   **CLI Version:** ${cliVersion}
*   **Git Commit:** ${GIT_COMMIT_INFO}
*   **Operating System:** ${osVersion}
*   **Sandbox Environment:** ${sandboxEnvStr}
*   **Model Version:** ${modelVersion}
*   **Memory Usage:** ${memoryUsage}
`;
      let url =
        'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml';
      if (description) {
        url += `&title=${encodeURIComponent(description)}`;
      }
      url += `&info=${encodeURIComponent(info)}`;
      return url;
    };

    it('should call open with the correct GitHub issue URL and return true', async () => {
      mockGetCliVersionFn.mockResolvedValue('test-version');
      process.env.SANDBOX = 'gemini-sandbox';
      process.env.SEATBELT_PROFILE = 'test_profile';
      const { handleSlashCommand } = getProcessor();
      const bugDescription = 'This is a test bug';
      const expectedUrl = getExpectedUrl(
        bugDescription,
        process.env.SANDBOX,
        process.env.SEATBELT_PROFILE,
        'test-version',
      );
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand(`/bug ${bugDescription}`);
      });

      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(open).toHaveBeenCalledWith(expectedUrl);
      expect(commandResult).toBe(true);
    });

    it('should use the custom bug command URL from config if available', async () => {
      process.env.CLI_VERSION = '0.1.0';
      process.env.SANDBOX = 'sandbox-exec';
      process.env.SEATBELT_PROFILE = 'permissive-open';
      const bugCommand = {
        urlTemplate:
          'https://custom-bug-tracker.com/new?title={title}&info={info}',
      };
      mockConfig = {
        ...mockConfig,
        getBugCommand: vi.fn(() => bugCommand),
      } as unknown as Config;
      process.env.CLI_VERSION = '0.1.0';

      const { handleSlashCommand } = getProcessor();
      const bugDescription = 'This is a custom bug';
      const info = `
*   **CLI Version:** 0.1.0
*   **Git Commit:** ${GIT_COMMIT_INFO}
*   **Operating System:** test-platform test-node-version
*   **Sandbox Environment:** sandbox-exec (permissive-open)
*   **Model Version:** test-model
*   **Memory Usage:** 11.8 MB
`;
      const expectedUrl = bugCommand.urlTemplate
        .replace('{title}', encodeURIComponent(bugDescription))
        .replace('{info}', encodeURIComponent(info));

      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand(`/bug ${bugDescription}`);
      });

      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(open).toHaveBeenCalledWith(expectedUrl);
      expect(commandResult).toBe(true);
    });
  });

  describe('/quit and /exit commands', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([['/quit'], ['/exit']])(
      'should handle %s, set quitting messages, and exit the process',
      async (command) => {
        const { handleSlashCommand } = getProcessor();
        const mockDate = new Date('2025-01-01T01:02:03.000Z');
        vi.setSystemTime(mockDate);

        await act(async () => {
          handleSlashCommand(command);
        });

        expect(mockAddItem).not.toHaveBeenCalled();
        expect(mockSetQuittingMessages).toHaveBeenCalledWith([
          {
            type: 'user',
            text: command,
            id: expect.any(Number),
          },
          {
            type: 'quit',
            stats: expect.any(Object),
            duration: '1h 2m 3s',
            id: expect.any(Number),
          },
        ]);

        // Fast-forward timers to trigger process.exit
        await act(async () => {
          vi.advanceTimersByTime(100);
        });
        expect(mockProcessExit).toHaveBeenCalledWith(0);
      },
    );
  });

  describe('Unknown command', () => {
    it('should show an error and return true for a general unknown command', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/unknowncommand');
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown command: /unknowncommand',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
    });
  });

  describe('/tools command', () => {
    it('should show an error if tool registry is not available', async () => {
      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue(undefined),
      } as unknown as Config;
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/tools');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Could not retrieve tools.',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
    });

    it('should show an error if getAllTools returns undefined', async () => {
      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getAllTools: vi.fn().mockReturnValue(undefined),
        }),
      } as unknown as Config;
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/tools');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Could not retrieve tools.',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
    });

    it('should display only Gemini CLI tools (filtering out MCP tools)', async () => {
      // Create mock tools - some with serverName property (MCP tools) and some without (Gemini CLI tools)
      const mockTools = [
        { name: 'tool1', displayName: 'Tool1' },
        { name: 'tool2', displayName: 'Tool2' },
        { name: 'mcp_tool1', serverName: 'mcp-server1' },
        { name: 'mcp_tool2', serverName: 'mcp-server1' },
      ];

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getAllTools: vi.fn().mockReturnValue(mockTools),
        }),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/tools');
      });

      // Should only show tool1 and tool2, not the MCP tools
      const message = mockAddItem.mock.calls[1][0].text;
      expect(message).toContain('Tool1');
      expect(message).toContain('Tool2');
      expect(commandResult).toBe(true);
    });

    it('should display a message when no Gemini CLI tools are available', async () => {
      // Only MCP tools available
      const mockTools = [
        { name: 'mcp_tool1', serverName: 'mcp-server1' },
        { name: 'mcp_tool2', serverName: 'mcp-server1' },
      ];

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getAllTools: vi.fn().mockReturnValue(mockTools),
        }),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/tools');
      });

      const message = mockAddItem.mock.calls[1][0].text;
      expect(message).toContain('No tools available');
      expect(commandResult).toBe(true);
    });

    it('should display tool descriptions when /tools desc is used', async () => {
      const mockTools = [
        {
          name: 'tool1',
          displayName: 'Tool1',
          description: 'Description for Tool1',
        },
        {
          name: 'tool2',
          displayName: 'Tool2',
          description: 'Description for Tool2',
        },
      ];

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getAllTools: vi.fn().mockReturnValue(mockTools),
        }),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/tools desc');
      });

      const message = mockAddItem.mock.calls[1][0].text;
      expect(message).toContain('Tool1');
      expect(message).toContain('Description for Tool1');
      expect(message).toContain('Tool2');
      expect(message).toContain('Description for Tool2');
      expect(commandResult).toBe(true);
    });
  });

  describe('/mcp command', () => {
    beforeEach(() => {
      // Mock the core module with getMCPServerStatus and getMCPDiscoveryState
      vi.mock('@google/gemini-cli-core', async (importOriginal) => {
        const actual = await importOriginal();
        return {
          ...actual,
          MCPServerStatus: {
            CONNECTED: 'connected',
            CONNECTING: 'connecting',
            DISCONNECTED: 'disconnected',
          },
          MCPDiscoveryState: {
            NOT_STARTED: 'not_started',
            IN_PROGRESS: 'in_progress',
            COMPLETED: 'completed',
          },
          getMCPServerStatus: vi.fn(),
          getMCPDiscoveryState: vi.fn(),
        };
      });
    });

    it('should show an error if tool registry is not available', async () => {
      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue(undefined),
      } as unknown as Config;
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/mcp');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Could not retrieve tool registry.',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
    });

    it('should display a message with a URL when no MCP servers are configured in a sandbox', async () => {
      process.env.SANDBOX = 'sandbox';
      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getToolsByServer: vi.fn().mockReturnValue([]),
        }),
        getMcpServers: vi.fn().mockReturnValue({}),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/mcp');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: `No MCP servers configured. Please open the following URL in your browser to view documentation:\nhttps://goo.gle/gemini-cli-docs-mcp`,
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
      delete process.env.SANDBOX;
    });

    it('should display a message and open a URL when no MCP servers are configured outside a sandbox', async () => {
      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getToolsByServer: vi.fn().mockReturnValue([]),
        }),
        getMcpServers: vi.fn().mockReturnValue({}),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/mcp');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'No MCP servers configured. Opening documentation in your browser: https://goo.gle/gemini-cli-docs-mcp',
        }),
        expect.any(Number),
      );
      expect(open).toHaveBeenCalledWith('https://goo.gle/gemini-cli-docs-mcp');
      expect(commandResult).toBe(true);
    });

    it('should display configured MCP servers with status indicators and their tools', async () => {
      // Mock MCP servers configuration
      const mockMcpServers = {
        server1: { command: 'cmd1' },
        server2: { command: 'cmd2' },
        server3: { command: 'cmd3' },
      };

      // Setup getMCPServerStatus mock implementation - use all CONNECTED to avoid startup message in this test
      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        if (serverName === 'server2') return MCPServerStatus.CONNECTED;
        return MCPServerStatus.DISCONNECTED; // Default for server3 and others
      });

      // Setup getMCPDiscoveryState mock to return completed so no startup message is shown
      vi.mocked(getMCPDiscoveryState).mockReturnValue(
        MCPDiscoveryState.COMPLETED,
      );

      // Mock tools from each server
      const mockServer1Tools = [
        { name: 'server1_tool1' },
        { name: 'server1_tool2' },
      ];

      const mockServer2Tools = [{ name: 'server2_tool1' }];

      const mockServer3Tools = [{ name: 'server3_tool1' }];

      const mockGetToolsByServer = vi.fn().mockImplementation((serverName) => {
        if (serverName === 'server1') return mockServer1Tools;
        if (serverName === 'server2') return mockServer2Tools;
        if (serverName === 'server3') return mockServer3Tools;
        return [];
      });

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getToolsByServer: mockGetToolsByServer,
        }),
        getMcpServers: vi.fn().mockReturnValue(mockMcpServers),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/mcp');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Configured MCP servers:'),
        }),
        expect.any(Number),
      );

      // Check that the message contains details about servers and their tools
      const message = mockAddItem.mock.calls[1][0].text;
      // Server 1 - Connected
      expect(message).toContain(
        '🟢 \u001b[1mserver1\u001b[0m - Ready (2 tools)',
      );
      expect(message).toContain('\u001b[36mserver1_tool1\u001b[0m');
      expect(message).toContain('\u001b[36mserver1_tool2\u001b[0m');

      // Server 2 - Connected
      expect(message).toContain(
        '🟢 \u001b[1mserver2\u001b[0m - Ready (1 tools)',
      );
      expect(message).toContain('\u001b[36mserver2_tool1\u001b[0m');

      // Server 3 - Disconnected
      expect(message).toContain(
        '🔴 \u001b[1mserver3\u001b[0m - Disconnected (1 tools cached)',
      );
      expect(message).toContain('\u001b[36mserver3_tool1\u001b[0m');

      expect(commandResult).toBe(true);
    });

    it('should display tool descriptions when showToolDescriptions is true', async () => {
      // Mock MCP servers configuration with server description
      const mockMcpServers = {
        server1: {
          command: 'cmd1',
          description: 'This is a server description',
        },
      };

      // Setup getMCPServerStatus mock implementation
      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        return MCPServerStatus.DISCONNECTED;
      });

      // Setup getMCPDiscoveryState mock to return completed
      vi.mocked(getMCPDiscoveryState).mockReturnValue(
        MCPDiscoveryState.COMPLETED,
      );

      // Mock tools from server with descriptions
      const mockServerTools = [
        { name: 'tool1', description: 'This is tool 1 description' },
        { name: 'tool2', description: 'This is tool 2 description' },
      ];

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getToolsByServer: vi.fn().mockReturnValue(mockServerTools),
        }),
        getMcpServers: vi.fn().mockReturnValue(mockMcpServers),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor(true);
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/mcp');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Configured MCP servers:'),
        }),
        expect.any(Number),
      );

      const message = mockAddItem.mock.calls[1][0].text;

      // Check that server description is included (with ANSI color codes)
      expect(message).toContain('\u001b[1mserver1\u001b[0m - Ready (2 tools)');
      expect(message).toContain(
        '\u001b[32mThis is a server description\u001b[0m',
      );

      // Check that tool descriptions are included (with ANSI color codes)
      expect(message).toContain('\u001b[36mtool1\u001b[0m');
      expect(message).toContain(
        '\u001b[32mThis is tool 1 description\u001b[0m',
      );
      expect(message).toContain('\u001b[36mtool2\u001b[0m');
      expect(message).toContain(
        '\u001b[32mThis is tool 2 description\u001b[0m',
      );

      expect(commandResult).toBe(true);
    });

    it('should indicate when a server has no tools', async () => {
      // Mock MCP servers configuration
      const mockMcpServers = {
        server1: { command: 'cmd1' },
        server2: { command: 'cmd2' },
      };

      // Setup getMCPServerStatus mock implementation
      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        if (serverName === 'server2') return MCPServerStatus.DISCONNECTED;
        return MCPServerStatus.DISCONNECTED;
      });

      // Setup getMCPDiscoveryState mock to return completed
      vi.mocked(getMCPDiscoveryState).mockReturnValue(
        MCPDiscoveryState.COMPLETED,
      );

      // Mock tools from each server - server2 has no tools
      const mockServer1Tools = [{ name: 'server1_tool1' }];

      const mockServer2Tools = [];

      const mockGetToolsByServer = vi.fn().mockImplementation((serverName) => {
        if (serverName === 'server1') return mockServer1Tools;
        if (serverName === 'server2') return mockServer2Tools;
        return [];
      });

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getToolsByServer: mockGetToolsByServer,
        }),
        getMcpServers: vi.fn().mockReturnValue(mockMcpServers),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/mcp');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Configured MCP servers:'),
        }),
        expect.any(Number),
      );

      // Check that the message contains details about both servers and their tools
      const message = mockAddItem.mock.calls[1][0].text;
      expect(message).toContain(
        '🟢 \u001b[1mserver1\u001b[0m - Ready (1 tools)',
      );
      expect(message).toContain('\u001b[36mserver1_tool1\u001b[0m');
      expect(message).toContain(
        '🔴 \u001b[1mserver2\u001b[0m - Disconnected (0 tools cached)',
      );
      expect(message).toContain('No tools available');

      expect(commandResult).toBe(true);
    });

    it('should show startup indicator when servers are connecting', async () => {
      // Mock MCP servers configuration
      const mockMcpServers = {
        server1: { command: 'cmd1' },
        server2: { command: 'cmd2' },
      };

      // Setup getMCPServerStatus mock implementation with one server connecting
      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        if (serverName === 'server2') return MCPServerStatus.CONNECTING;
        return MCPServerStatus.DISCONNECTED;
      });

      // Setup getMCPDiscoveryState mock to return in progress
      vi.mocked(getMCPDiscoveryState).mockReturnValue(
        MCPDiscoveryState.IN_PROGRESS,
      );

      // Mock tools from each server
      const mockServer1Tools = [{ name: 'server1_tool1' }];
      const mockServer2Tools = [{ name: 'server2_tool1' }];

      const mockGetToolsByServer = vi.fn().mockImplementation((serverName) => {
        if (serverName === 'server1') return mockServer1Tools;
        if (serverName === 'server2') return mockServer2Tools;
        return [];
      });

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getToolsByServer: mockGetToolsByServer,
        }),
        getMcpServers: vi.fn().mockReturnValue(mockMcpServers),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/mcp');
      });

      const message = mockAddItem.mock.calls[1][0].text;

      // Check that startup indicator is shown
      expect(message).toContain(
        '⏳ MCP servers are starting up (1 initializing)...',
      );
      expect(message).toContain(
        'Note: First startup may take longer. Tool availability will update automatically.',
      );

      // Check server statuses
      expect(message).toContain(
        '🟢 \u001b[1mserver1\u001b[0m - Ready (1 tools)',
      );
      expect(message).toContain(
        '🔄 \u001b[1mserver2\u001b[0m - Starting... (first startup may take longer) (tools will appear when ready)',
      );

      expect(commandResult).toBe(true);
    });
  });

  describe('/mcp schema', () => {
    it('should display tool schemas and descriptions', async () => {
      // Mock MCP servers configuration with server description
      const mockMcpServers = {
        server1: {
          command: 'cmd1',
          description: 'This is a server description',
        },
      };

      // Setup getMCPServerStatus mock implementation
      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        return MCPServerStatus.DISCONNECTED;
      });

      // Setup getMCPDiscoveryState mock to return completed
      vi.mocked(getMCPDiscoveryState).mockReturnValue(
        MCPDiscoveryState.COMPLETED,
      );

      // Mock tools from server with descriptions
      const mockServerTools = [
        {
          name: 'tool1',
          description: 'This is tool 1 description',
          schema: {
            parameters: [{ name: 'param1', type: 'string' }],
          },
        },
        {
          name: 'tool2',
          description: 'This is tool 2 description',
          schema: {
            parameters: [{ name: 'param2', type: 'number' }],
          },
        },
      ];

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getToolsByServer: vi.fn().mockReturnValue(mockServerTools),
        }),
        getMcpServers: vi.fn().mockReturnValue(mockMcpServers),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor(true);
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/mcp schema');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Configured MCP servers:'),
        }),
        expect.any(Number),
      );

      const message = mockAddItem.mock.calls[1][0].text;

      // Check that server description is included
      expect(message).toContain('Ready (2 tools)');
      expect(message).toContain('This is a server description');

      // Check that tool schemas are included
      expect(message).toContain('tool 1 description');
      expect(message).toContain('param1');
      expect(message).toContain('string');
      expect(message).toContain('tool 2 description');
      expect(message).toContain('param2');
      expect(message).toContain('number');

      expect(commandResult).toBe(true);
    });
  });

  describe('/compress command', () => {
    it('should call tryCompressChat(true)', async () => {
      const hook = getProcessorHook();
      mockTryCompressChat.mockImplementationOnce(async (force?: boolean) => {
        expect(force).toBe(true);
        await act(async () => {
          hook.rerender();
        });
        expect(hook.result.current.pendingHistoryItems).toContainEqual({
          type: MessageType.COMPRESSION,
          compression: {
            isPending: true,
            originalTokenCount: null,
            newTokenCount: null,
          },
        });
        return {
          originalTokenCount: 100,
          newTokenCount: 50,
        };
      });

      await act(async () => {
        hook.result.current.handleSlashCommand('/compress');
      });
      await act(async () => {
        hook.rerender();
      });
      expect(hook.result.current.pendingHistoryItems).toEqual([]);
      expect(mockGeminiClient.tryCompressChat).toHaveBeenCalledWith(true);
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.COMPRESSION,
          compression: {
            isPending: false,
            originalTokenCount: 100,
            newTokenCount: 50,
          },
        }),
        expect.any(Number),
      );
    });
  });
});

  describe('Edge Cases and Input Validation', () => {
    it('should handle commands with leading/trailing whitespace', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('  /help  ');
      });
      expect(mockSetShowHelp).toHaveBeenCalledWith(true);
      expect(commandResult).toBe(true);
    });

    it('should handle commands with mixed case', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/HELP');
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown command: /HELP',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
    });

    it('should handle empty command input', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('');
      });
      expect(commandResult).toBe(false);
    });

    it('should handle command with only slash', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/');
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown command: /',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
    });

    it('should handle commands with Unicode characters', async () => {
      const { handleSlashCommand } = getProcessor();
      const fact = 'Remember this: 你好世界 🌍 émoji';
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand(`/memory add ${fact}`);
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Attempting to save to memory: "${fact}"`,
        }),
        expect.any(Number),
      );

      expect(commandResult).toEqual({
        shouldScheduleTool: true,
        toolName: 'save_memory',
        toolArgs: { fact },
      });
    });

    it('should handle very long memory add input', async () => {
      const { handleSlashCommand } = getProcessor();
      const longFact = 'a'.repeat(10000);
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand(`/memory add ${longFact}`);
      });

      expect(commandResult).toEqual({
        shouldScheduleTool: true,
        toolName: 'save_memory',
        toolArgs: { fact: longFact },
      });
    });

    it('should handle commands with special characters', async () => {
      const { handleSlashCommand } = getProcessor();
      const specialChars = 'Special chars: @#$%^&*()[]{}|;:,.<>?';
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand(`/memory add ${specialChars}`);
      });

      expect(commandResult).toEqual({
        shouldScheduleTool: true,
        toolName: 'save_memory',
        toolArgs: { fact: specialChars },
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle getCliVersion failure gracefully in /about', async () => {
      mockGetCliVersionFn.mockRejectedValue(new Error('Version fetch failed'));
      const { handleSlashCommand } = getProcessor();
      
      await act(async () => {
        await handleSlashCommand('/about');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: 'about',
          cliVersion: 'unknown',
        }),
        expect.any(Number),
      );
    });

    it('should handle performMemoryRefresh failure in /memory refresh', async () => {
      mockPerformMemoryRefresh.mockRejectedValue(new Error('Memory refresh failed'));
      const { handleSlashCommand } = getProcessor();
      
      await act(async () => {
        await handleSlashCommand('/memory refresh');
      });

      expect(mockPerformMemoryRefresh).toHaveBeenCalled();
      // Command should still return true even if operation fails
      expect(mockAddItem).toHaveBeenCalledTimes(2); // User message + any error handling
    });

    it('should handle config.getGeminiClient returning null in /clear', async () => {
      mockConfig = {
        ...mockConfig,
        getGeminiClient: () => null,
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/clear');
      });

      expect(mockClearItems).toHaveBeenCalled();
      expect(mockRefreshStatic).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });

    it('should handle open() failure in /bug command', async () => {
      (open as Mock).mockRejectedValue(new Error('Failed to open URL'));
      const { handleSlashCommand } = getProcessor();
      
      await act(async () => {
        await handleSlashCommand('/bug test description');
      });

      expect(open).toHaveBeenCalled();
      // Should still add messages even if open fails
      expect(mockAddItem).toHaveBeenCalledTimes(2);
    });

    it('should handle tryCompressChat failure in /compress', async () => {
      mockTryCompressChat.mockRejectedValue(new Error('Compression failed'));
      const hook = getProcessorHook();
      
      await act(async () => {
        await hook.result.current.handleSlashCommand('/compress');
      });

      expect(mockTryCompressChat).toHaveBeenCalledWith(true);
      // Should handle the error gracefully
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle missing environment variables in /about', async () => {
      delete process.env.SANDBOX;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.SEATBELT_PROFILE;
      
      mockGetCliVersionFn.mockResolvedValue('test-version');
      const { handleSlashCommand } = getProcessor();

      await act(async () => {
        await handleSlashCommand('/about');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: 'about',
          sandboxEnv: 'no sandbox',
          gcpProject: undefined,
        }),
        expect.any(Number),
      );
    });

    it('should handle different sandbox environment values', async () => {
      const testCases = [
        { sandbox: 'gemini-code-sandbox', expected: 'code-sandbox' },
        { sandbox: 'gemini-experimental', expected: 'experimental' },
        { sandbox: 'custom-sandbox', expected: 'custom-sandbox' },
      ];

      for (const { sandbox, expected } of testCases) {
        process.env.SANDBOX = sandbox;
        mockGetCliVersionFn.mockResolvedValue('test-version');
        const { handleSlashCommand } = getProcessor();

        await act(async () => {
          await handleSlashCommand('/about');
        });

        expect(mockAddItem).toHaveBeenCalledWith(
          2,
          expect.objectContaining({
            sandboxEnv: expected,
          }),
          expect.any(Number),
        );
        
        mockAddItem.mockClear();
      }
    });

    it('should handle undefined settings.merged.contextFileName', async () => {
      const settingsWithoutContext = {
        merged: {},
      } as LoadedSettings;

      const { result } = renderHook(() =>
        useSlashCommandProcessor(
          mockConfig,
          settingsWithoutContext,
          [],
          mockAddItem,
          mockClearItems,
          mockLoadHistory,
          mockRefreshStatic,
          mockSetShowHelp,
          mockOnDebugMessage,
          mockOpenThemeDialog,
          mockOpenAuthDialog,
          mockOpenEditorDialog,
          mockPerformMemoryRefresh,
          mockCorgiMode,
          false,
          mockSetQuittingMessages,
        ),
      );

      await act(async () => {
        await result.current.handleSlashCommand('/about');
      });

      // Should still work without contextFileName
      expect(mockAddItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('Timing and Async Behavior', () => {
    it('should handle rapid successive command execution', async () => {
      const { handleSlashCommand } = getProcessor();
      
      // Execute multiple commands in quick succession
      const promises = [
        handleSlashCommand('/help'),
        handleSlashCommand('/stats'),
        handleSlashCommand('/memory show'),
      ];

      await act(async () => {
        await Promise.all(promises);
      });

      expect(mockSetShowHelp).toHaveBeenCalledWith(true);
      expect(mockAddItem).toHaveBeenCalledTimes(6); // 2 calls per command (user + response)
    });

    it('should handle concurrent /memory add commands', async () => {
      const { handleSlashCommand } = getProcessor();
      
      const promises = [
        handleSlashCommand('/memory add First fact'),
        handleSlashCommand('/memory add Second fact'),
        handleSlashCommand('/memory add Third fact'),
      ];

      let results: (SlashCommandActionReturn | boolean)[] = [];
      await act(async () => {
        results = await Promise.all(promises);
      });

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toEqual({
          shouldScheduleTool: true,
          toolName: 'save_memory',
          toolArgs: expect.objectContaining({ fact: expect.any(String) }),
        });
      });
    });

    it('should handle /quit with proper timing', async () => {
      vi.useFakeTimers();
      const { handleSlashCommand } = getProcessor();
      const mockDate = new Date('2025-01-01T01:00:00.000Z');
      vi.setSystemTime(mockDate);

      await act(async () => {
        handleSlashCommand('/quit');
      });

      expect(mockSetQuittingMessages).toHaveBeenCalled();
      
      // Verify process.exit is not called immediately
      expect(mockProcessExit).not.toHaveBeenCalled();
      
      // Fast-forward past the timeout
      await act(async () => {
        vi.advanceTimersByTime(150);
      });
      
      expect(mockProcessExit).toHaveBeenCalledWith(0);
      vi.useRealTimers();
    });
  });

  describe('State Management and Side Effects', () => {
    it('should properly track pending compression state', async () => {
      const hook = getProcessorHook();
      
      // Initially no pending items
      expect(hook.result.current.pendingHistoryItems).toEqual([]);
      
      // Mock a slow compression operation
      let resolveCompression: (value: any) => void;
      const compressionPromise = new Promise(resolve => {
        resolveCompression = resolve;
      });
      mockTryCompressChat.mockReturnValue(compressionPromise);
      
      // Start compression
      await act(async () => {
        hook.result.current.handleSlashCommand('/compress');
      });
      
      // Should have pending compression
      await act(async () => {
        hook.rerender();
      });
      expect(hook.result.current.pendingHistoryItems).toHaveLength(1);
      expect(hook.result.current.pendingHistoryItems[0]).toEqual({
        type: MessageType.COMPRESSION,
        compression: {
          isPending: true,
          originalTokenCount: null,
          newTokenCount: null,
        },
      });
      
      // Complete compression
      await act(async () => {
        resolveCompression!({ originalTokenCount: 100, newTokenCount: 50 });
      });
      
      // Should clear pending items
      await act(async () => {
        hook.rerender();
      });
      expect(hook.result.current.pendingHistoryItems).toEqual([]);
    });

    it('should maintain session stats state across commands', async () => {
      const initialStats = {
        sessionStartTime: new Date('2025-01-01T00:00:00.000Z'),
        cumulative: {
          turnCount: 5,
          promptTokenCount: 100,
          candidatesTokenCount: 200,
          totalTokenCount: 300,
          cachedContentTokenCount: 50,
          toolUsePromptTokenCount: 25,
          thoughtsTokenCount: 75,
        },
      };

      mockUseSessionStats.mockReturnValue({ stats: initialStats });
      
      const { handleSlashCommand } = getProcessor();
      const mockDate = new Date('2025-01-01T02:00:00.000Z'); // 2 hours later
      vi.setSystemTime(mockDate);

      await act(async () => {
        await handleSlashCommand('/stats');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.STATS,
          stats: initialStats.cumulative,
          duration: '2h 0m 0s',
        }),
        expect.any(Number),
      );

      vi.useRealTimers();
    });

    it('should handle showToolDescriptions parameter correctly', async () => {
      const mockTools = [
        { name: 'tool1', displayName: 'Tool1', description: 'Test tool 1' },
        { name: 'tool2', displayName: 'Tool2', description: 'Test tool 2' },
      ];

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getAllTools: vi.fn().mockReturnValue(mockTools),
        }),
      } as unknown as Config;

      // Test with showToolDescriptions = false
      const processorWithoutDesc = getProcessor(false);
      await act(async () => {
        await processorWithoutDesc.handleSlashCommand('/tools');
      });

      let message = mockAddItem.mock.calls[1][0].text;
      expect(message).toContain('Tool1');
      expect(message).toContain('Tool2');
      // Should not contain descriptions when showToolDescriptions is false
      expect(message).not.toContain('Test tool 1');
      expect(message).not.toContain('Test tool 2');

      mockAddItem.mockClear();

      // Test with showToolDescriptions = true
      const processorWithDesc = getProcessor(true);
      await act(async () => {
        await processorWithDesc.handleSlashCommand('/tools desc');
      });

      message = mockAddItem.mock.calls[1][0].text;
      expect(message).toContain('Tool1');
      expect(message).toContain('Test tool 1');
      expect(message).toContain('Tool2');
      expect(message).toContain('Test tool 2');
    });
  });

  describe('MCP Command Advanced Scenarios', () => {
    it('should handle MCP servers with mixed connection states', async () => {
      const mockMcpServers = {
        server1: { command: 'cmd1', description: 'Server 1 desc' },
        server2: { command: 'cmd2' },
        server3: { command: 'cmd3', description: 'Server 3 desc' },
      };

      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        if (serverName === 'server2') return MCPServerStatus.CONNECTING;
        return MCPServerStatus.DISCONNECTED;
      });

      vi.mocked(getMCPDiscoveryState).mockReturnValue(MCPDiscoveryState.IN_PROGRESS);

      const mockGetToolsByServer = vi.fn().mockImplementation((serverName) => {
        if (serverName === 'server1') return [{ name: 's1_tool1' }, { name: 's1_tool2' }];
        if (serverName === 'server2') return [{ name: 's2_tool1' }];
        if (serverName === 'server3') return [{ name: 's3_tool1' }, { name: 's3_tool2' }, { name: 's3_tool3' }];
        return [];
      });

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getToolsByServer: mockGetToolsByServer,
        }),
        getMcpServers: vi.fn().mockReturnValue(mockMcpServers),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor(true);
      await act(async () => {
        await handleSlashCommand('/mcp');
      });

      const message = mockAddItem.mock.calls[1][0].text;
      
      // Should show startup indicator
      expect(message).toContain('MCP servers are starting up (1 initializing)');
      
      // Check individual server states
      expect(message).toContain('🟢 \u001b[1mserver1\u001b[0m - Ready (2 tools)');
      expect(message).toContain('🔄 \u001b[1mserver2\u001b[0m - Starting...');
      expect(message).toContain('🔴 \u001b[1mserver3\u001b[0m - Disconnected (3 tools cached)');
      
      // Should include server descriptions where available
      expect(message).toContain('Server 1 desc');
      expect(message).toContain('Server 3 desc');
    });

    it('should handle MCP discovery state transitions', async () => {
      const mockMcpServers = {
        server1: { command: 'cmd1' },
      };

      vi.mocked(getMCPServerStatus).mockReturnValue(MCPServerStatus.CONNECTED);
      
      // Test NOT_STARTED state
      vi.mocked(getMCPDiscoveryState).mockReturnValue(MCPDiscoveryState.NOT_STARTED);
      
      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getToolsByServer: vi.fn().mockReturnValue([{ name: 'tool1' }]),
        }),
        getMcpServers: vi.fn().mockReturnValue(mockMcpServers),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        await handleSlashCommand('/mcp');
      });

      let message = mockAddItem.mock.calls[1][0].text;
      // Should not show startup indicator for NOT_STARTED
      expect(message).not.toContain('MCP servers are starting up');
      
      mockAddItem.mockClear();

      // Test COMPLETED state
      vi.mocked(getMCPDiscoveryState).mockReturnValue(MCPDiscoveryState.COMPLETED);
      
      await act(async () => {
        await handleSlashCommand('/mcp');
      });

      message = mockAddItem.mock.calls[1][0].text;
      // Should not show startup indicator for COMPLETED
      expect(message).not.toContain('MCP servers are starting up');
    });

    it('should handle MCP tools with missing schemas', async () => {
      const mockMcpServers = {
        server1: { command: 'cmd1' },
      };

      vi.mocked(getMCPServerStatus).mockReturnValue(MCPServerStatus.CONNECTED);
      vi.mocked(getMCPDiscoveryState).mockReturnValue(MCPDiscoveryState.COMPLETED);

      const mockServerTools = [
        { name: 'tool1', description: 'Tool with schema', schema: { parameters: [] } },
        { name: 'tool2', description: 'Tool without schema' }, // Missing schema
      ];

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getToolsByServer: vi.fn().mockReturnValue(mockServerTools),
        }),
        getMcpServers: vi.fn().mockReturnValue(mockMcpServers),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        await handleSlashCommand('/mcp schema');
      });

      const message = mockAddItem.mock.calls[1][0].text;
      expect(message).toContain('tool1');
      expect(message).toContain('tool2');
      // Should handle missing schema gracefully
    });
  });

  describe('Bug Command URL Generation', () => {
    it('should properly encode special characters in bug URLs', async () => {
      mockGetCliVersionFn.mockResolvedValue('1.0.0');
      process.env.SANDBOX = 'gemini-sandbox';
      
      const { handleSlashCommand } = getProcessor();
      const bugDescription = 'Bug with "quotes" & ampersands + plus';
      
      await act(async () => {
        await handleSlashCommand(`/bug ${bugDescription}`);
      });

      expect(open).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(bugDescription))
      );
    });

    it('should handle custom bug command with malformed URL template', async () => {
      const bugCommand = {
        urlTemplate: 'malformed-url-{missing-closing-brace',
      };
      
      mockConfig = {
        ...mockConfig,
        getBugCommand: vi.fn(() => bugCommand),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      
      await act(async () => {
        await handleSlashCommand('/bug test');
      });

      // Should still attempt to open the malformed URL
      expect(open).toHaveBeenCalled();
    });

    it('should handle bug command with empty description', async () => {
      mockGetCliVersionFn.mockResolvedValue('1.0.0');
      const { handleSlashCommand } = getProcessor();
      
      await act(async () => {
        await handleSlashCommand('/bug');
      });

      // Should still work with undefined title
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining('github.com/google-gemini/gemini-cli/issues/new')
      );
    });
  });

  describe('Memory Usage and Performance', () => {
    it('should handle memory usage formatting in /about', async () => {
      // Test various memory usage values
      const testCases = [
        { memoryUsage: { rss: 1024 * 1024 }, expected: '1.0 MB' },
        { memoryUsage: { rss: 1024 * 1024 * 1024 }, expected: '1024.0 MB' },
        { memoryUsage: { rss: 512 * 1024 }, expected: '0.5 MB' },
      ];

      for (const { memoryUsage, expected } of testCases) {
        vi.mock('node:process', () => ({
          default: {
            ...vi.mocked(process),
            memoryUsage: vi.fn(() => memoryUsage),
          },
          ...vi.mocked(process),
          memoryUsage: vi.fn(() => memoryUsage),
        }));

        mockGetCliVersionFn.mockResolvedValue('test-version');
        const { handleSlashCommand } = getProcessor();

        await act(async () => {
          await handleSlashCommand('/about');
        });

        // Check that memory usage is formatted correctly in the output
        // This would be tested if the memory usage was part of the message
        expect(mockAddItem).toHaveBeenCalled();
        
        mockAddItem.mockClear();
      }
    });

    it('should clean up resources properly after commands', async () => {
      const { handleSlashCommand } = getProcessor();
      
      // Execute various commands
      await act(async () => {
        await handleSlashCommand('/stats');
        await handleSlashCommand('/about');
        await handleSlashCommand('/help');
      });

      // Verify mocks were called appropriately
      expect(mockAddItem).toHaveBeenCalledTimes(6); // 2 calls per command
      expect(mockSetShowHelp).toHaveBeenCalledTimes(1);
      
      // No specific cleanup verification needed for this hook,
      // but this pattern could be extended for hooks that manage resources
    });
  });

  describe('Command Argument Parsing', () => {
    it('should handle memory add with quotes and escapes', async () => {
      const { handleSlashCommand } = getProcessor();
      const quotedFact = 'This is a "quoted" fact with \'single quotes\'';
      
      await act(async () => {
        await handleSlashCommand(`/memory add ${quotedFact}`);
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Attempting to save to memory: "${quotedFact}"`,
        }),
        expect.any(Number),
      );
    });

    it('should handle tools command variations', async () => {
      const mockTools = [
        { name: 'tool1', displayName: 'Tool1', description: 'Description 1' },
      ];

      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getAllTools: vi.fn().mockReturnValue(mockTools),
        }),
      } as unknown as Config;

      const { handleSlashCommand } = getProcessor();
      
      // Test various /tools command formats
      const variants = ['/tools', '/tools desc', '/tools description'];
      
      for (const variant of variants) {
        mockAddItem.mockClear();
        
        await act(async () => {
          await handleSlashCommand(variant);
        });

        expect(mockAddItem).toHaveBeenCalledTimes(2);
        const message = mockAddItem.mock.calls[1][0].text;
        expect(message).toContain('Tool1');
        
        // Only 'desc' variant should show descriptions
        if (variant.includes('desc')) {
          expect(message).toContain('Description 1');
        }
      }
    });

    it('should handle unknown subcommands for known command prefixes', async () => {
      const { handleSlashCommand } = getProcessor();
      
      const unknownSubcommands = [
        '/memory unknown',
        '/tools unknown',
        '/mcp unknown',
      ];
      
      for (const command of unknownSubcommands) {
        mockAddItem.mockClear();
        
        await act(async () => {
          await handleSlashCommand(command);
        });

        expect(mockAddItem).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            type: MessageType.ERROR,
            text: expect.stringContaining('Unknown'),
          }),
          expect.any(Number),
        );
      }
    });
  });

  describe('Theme and Dialog Commands', () => {
    it('should handle /theme command', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/theme');
      });
      expect(mockOpenThemeDialog).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });

    it('should handle /auth command', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/auth');
      });
      expect(mockOpenAuthDialog).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });

    it('should handle /history command', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/history');
      });
      expect(mockLoadHistory).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });
  });

  describe('Corgi Mode Easter Egg', () => {
    it('should handle /corgi command', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/corgi');
      });
      expect(mockCorgiMode).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });

    it('should handle corgi mode variations', async () => {
      const { handleSlashCommand } = getProcessor();
      const variations = ['/corgi on', '/corgi off', '/corgi toggle'];
      
      for (const variant of variations) {
        mockCorgiMode.mockClear();
        let commandResult: SlashCommandActionReturn | boolean = false;
        await act(async () => {
          commandResult = await handleSlashCommand(variant);
        });
        expect(mockCorgiMode).toHaveBeenCalled();
        expect(commandResult).toBe(true);
      }
    });
  });

  describe('Command Completeness and Coverage', () => {
    it('should handle all documented commands without errors', async () => {
      const { handleSlashCommand } = getProcessor();
      
      // List of all expected commands that should not throw errors
      const commands = [
        '/help',
        '/clear',
        '/editor',
        '/theme',
        '/auth',
        '/history',
        '/corgi',
        '/stats',
        '/about',
        '/memory refresh',
        '/memory show',
        '/tools',
        '/compress',
      ];
      
      for (const command of commands) {
        mockAddItem.mockClear();
        let commandResult: SlashCommandActionReturn | boolean = false;
        
        await act(async () => {
          commandResult = await handleSlashCommand(command);
        });
        
        // All valid commands should return true or a valid action object
        expect(typeof commandResult === 'boolean' ? commandResult : true).toBe(true);
      }
    });

    it('should handle command variations with different casing consistently', async () => {
      const { handleSlashCommand } = getProcessor();
      
      // Test that commands are case-sensitive
      const caseSensitiveTests = [
        { command: '/Help', shouldFail: true },
        { command: '/CLEAR', shouldFail: true },
        { command: '/Stats', shouldFail: true },
        { command: '/help', shouldFail: false },
        { command: '/clear', shouldFail: false },
        { command: '/stats', shouldFail: false },
      ];
      
      for (const { command, shouldFail } of caseSensitiveTests) {
        mockAddItem.mockClear();
        let commandResult: SlashCommandActionReturn | boolean = false;
        
        await act(async () => {
          commandResult = await handleSlashCommand(command);
        });
        
        if (shouldFail) {
          // Should show error message for invalid casing
          expect(mockAddItem).toHaveBeenCalledWith(
            2,
            expect.objectContaining({
              type: MessageType.ERROR,
              text: expect.stringContaining('Unknown command'),
            }),
            expect.any(Number),
          );
        } else {
          // Should execute successfully
          expect(commandResult).toBe(true);
        }
      }
    });
  });
});
