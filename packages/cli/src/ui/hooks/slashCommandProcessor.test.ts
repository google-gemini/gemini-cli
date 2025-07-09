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
import { useSlashCommandProcessor } from './slashCommandProcessor.js';
import { MessageType, SlashCommandProcessorResult } from '../types.js';
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
import { CommandService } from '../../services/CommandService.js';
import { SlashCommand } from '../commands/types.js';

vi.mock('../contexts/SessionContext.js', () => ({
  useSessionStats: vi.fn(),
}));

vi.mock('../../services/CommandService.js');

vi.mock('./useShowMemoryCommand.js', () => ({
  SHOW_MEMORY_COMMAND_NAME: '/memory show',
  createShowMemoryAction: vi.fn(() => vi.fn()),
}));

vi.mock('open', () => ({
  default: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getMCPServerStatus: vi.fn(),
    getMCPDiscoveryState: vi.fn(),
  };
});

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
  let mockSetQuittingMessages: ReturnType<typeof vi.fn>;
  let mockTryCompressChat: ReturnType<typeof vi.fn>;
  let mockGeminiClient: GeminiClient;
  let mockConfig: Config;
  let mockCorgiMode: ReturnType<typeof vi.fn>;
  const mockUseSessionStats = useSessionStats as Mock;

  beforeEach(() => {
    // Reset all mocks to clear any previous state or calls.
    vi.clearAllMocks();

    // Default mock setup for CommandService for all the OLD tests.
    // This makes them pass again by simulating the original behavior where
    // the service is constructed but doesn't do much yet.
    vi.mocked(CommandService).mockImplementation(
      () =>
        ({
          loadCommands: vi.fn().mockResolvedValue(undefined),
          getCommands: vi.fn().mockReturnValue([]), // Return an empty array by default
        }) as unknown as CommandService,
    );

    mockAddItem = vi.fn();
    mockClearItems = vi.fn();
    mockLoadHistory = vi.fn();
    mockRefreshStatic = vi.fn();
    mockSetShowHelp = vi.fn();
    mockOnDebugMessage = vi.fn();
    mockOpenThemeDialog = vi.fn();
    mockOpenAuthDialog = vi.fn();
    mockOpenEditorDialog = vi.fn();
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
      getSessionId: vi.fn(() => 'test-session-id'),
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
    process.env = { ...globalThis.process.env };
  });

  const getProcessorHook = (showToolDescriptions: boolean = false) => {
    const settings = {
      merged: {
        contextFileName: 'GEMINI.md',
      },
    } as unknown as LoadedSettings;
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
        mockCorgiMode,
        showToolDescriptions,
        mockSetQuittingMessages,
        vi.fn(), // mockOpenPrivacyNotice
      ),
    );
  };

  const getProcessor = (showToolDescriptions: boolean = false) =>
    getProcessorHook(showToolDescriptions).result.current;

  describe('/stats command', () => {
    it('should show detailed session statistics', async () => {
      // Arrange
      mockUseSessionStats.mockReturnValue({
        stats: {
          sessionStartTime: new Date('2025-01-01T00:00:00.000Z'),
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
          duration: '1h 2m 3s',
        }),
        expect.any(Number),
      );

      vi.useRealTimers();
    });

    it('should show model-specific statistics when using /stats model', async () => {
      // Arrange
      const { handleSlashCommand } = getProcessor();

      // Act
      await act(async () => {
        handleSlashCommand('/stats model');
      });

      // Assert
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2, // Called after the user message
        expect.objectContaining({
          type: MessageType.MODEL_STATS,
        }),
        expect.any(Number),
      );
    });

    it('should show tool-specific statistics when using /stats tools', async () => {
      // Arrange
      const { handleSlashCommand } = getProcessor();

      // Act
      await act(async () => {
        handleSlashCommand('/stats tools');
      });

      // Assert
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2, // Called after the user message
        expect.objectContaining({
          type: MessageType.TOOL_STATS,
        }),
        expect.any(Number),
      );
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
      } as unknown as LoadedSettings;

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
          mockCorgiMode,
          false,
          mockSetQuittingMessages,
          vi.fn(), // mockOpenPrivacyNotice
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
    it('/editor should open editor dialog and return handled', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandProcessorResult | false = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/editor');
      });
      expect(mockOpenEditorDialog).toHaveBeenCalled();
      expect(commandResult).toEqual({ type: 'handled' });
    });
  });

  describe('New command registry', () => {
    let ActualCommandService: typeof CommandService;

    beforeAll(async () => {
      const actual = (await vi.importActual(
        '../../services/CommandService.js',
      )) as { CommandService: typeof CommandService };
      ActualCommandService = actual.CommandService;
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should execute a command from the new registry', async () => {
      const mockAction = vi.fn();
      const newCommand: SlashCommand = { name: 'test', action: mockAction };
      const mockLoader = async () => [newCommand];

      // We create the instance outside the mock implementation.
      const commandServiceInstance = new ActualCommandService(mockLoader);

      // This mock ensures the hook uses our pre-configured instance.
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();

      await vi.waitFor(() => {
        // We check that the `slashCommands` array, which is the public API
        // of our hook, eventually contains the command we injected.
        expect(
          result.current.slashCommands.some((c) => c.name === 'test'),
        ).toBe(true);
      });

      let commandResult: SlashCommandProcessorResult | false = false;
      await act(async () => {
        commandResult = await result.current.handleSlashCommand('/test');
      });

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(commandResult).toEqual({ type: 'handled' });
    });

    it('should return "schedule_tool" when a new command returns a tool action', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'tool',
        toolName: 'my_tool',
        toolArgs: { arg1: 'value1' },
      });
      const newCommand: SlashCommand = { name: 'test', action: mockAction };
      const mockLoader = async () => [newCommand];
      const commandServiceInstance = new ActualCommandService(mockLoader);
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();
      await vi.waitFor(() => {
        expect(
          result.current.slashCommands.some((c) => c.name === 'test'),
        ).toBe(true);
      });

      const commandResult = await result.current.handleSlashCommand('/test');

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(commandResult).toEqual({
        type: 'schedule_tool',
        toolName: 'my_tool',
        toolArgs: { arg1: 'value1' },
      });
    });

    it('should return "handled" when a new command returns a message action', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'message',
        messageType: 'info',
        content: 'This is a message',
      });
      const newCommand: SlashCommand = { name: 'test', action: mockAction };
      const mockLoader = async () => [newCommand];
      const commandServiceInstance = new ActualCommandService(mockLoader);
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();
      await vi.waitFor(() => {
        expect(
          result.current.slashCommands.some((c) => c.name === 'test'),
        ).toBe(true);
      });

      const commandResult = await result.current.handleSlashCommand('/test');

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: 'This is a message',
        }),
        expect.any(Number),
      );
      expect(commandResult).toEqual({ type: 'handled' });
    });

    it('should return "handled" when a new command returns a dialog action', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'dialog',
        dialog: 'help',
      });
      const newCommand: SlashCommand = { name: 'test', action: mockAction };
      const mockLoader = async () => [newCommand];
      const commandServiceInstance = new ActualCommandService(mockLoader);
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();
      await vi.waitFor(() => {
        expect(
          result.current.slashCommands.some((c) => c.name === 'test'),
        ).toBe(true);
      });

      const commandResult = await result.current.handleSlashCommand('/test');

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(mockSetShowHelp).toHaveBeenCalledWith(true);
      expect(commandResult).toEqual({ type: 'handled' });
    });

    it('should show help for a parent command with no action', async () => {
      const parentCommand: SlashCommand = {
        name: 'parent',
        subCommands: [
          { name: 'child', description: 'A child.', action: vi.fn() },
        ],
      };

      const mockLoader = async () => [parentCommand];
      const commandServiceInstance = new ActualCommandService(mockLoader);
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();

      await vi.waitFor(() => {
        expect(
          result.current.slashCommands.some((c) => c.name === 'parent'),
        ).toBe(true);
      });

      await act(async () => {
        await result.current.handleSlashCommand('/parent');
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: expect.stringContaining(
            "Command '/parent' requires a subcommand.",
          ),
        }),
        expect.any(Number),
      );
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
      vi.useRealTimers();
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
      let commandResult: SlashCommandProcessorResult | false = false;
      await act(async () => {
        commandResult = await handleSlashCommand(`/bug ${bugDescription}`);
      });

      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(open).toHaveBeenCalledWith(expectedUrl);
      expect(commandResult).toEqual({ type: 'handled' });
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

      let commandResult: SlashCommandProcessorResult | false = false;
      await act(async () => {
        commandResult = await handleSlashCommand(`/bug ${bugDescription}`);
      });

      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(open).toHaveBeenCalledWith(expectedUrl);
      expect(commandResult).toEqual({ type: 'handled' });
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
    it('should show an error and return handled for a general unknown command', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandProcessorResult | false = false;
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
      expect(commandResult).toEqual({ type: 'handled' });
    });
  });

  describe('/tools command', () => {
    it('should show an error if tool registry is not available', async () => {
      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue(undefined),
      } as unknown as Config;
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandProcessorResult | false = false;
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
      expect(commandResult).toEqual({ type: 'handled' });
    });

    it('should show an error if getAllTools returns undefined', async () => {
      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue({
          getAllTools: vi.fn().mockReturnValue(undefined),
        }),
      } as unknown as Config;
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandProcessorResult | false = false;
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
      expect(commandResult).toEqual({ type: 'handled' });
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
      let commandResult: SlashCommandProcessorResult | false = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/tools');
      });

      // Should only show tool1 and tool2, not the MCP tools
      const message = mockAddItem.mock.calls[1][0].text;
      expect(message).toContain('Tool1');
      expect(message).toContain('Tool2');
      expect(commandResult).toEqual({ type: 'handled' });
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
      let commandResult: SlashCommandProcessorResult | false = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/tools');
      });

      const message = mockAddItem.mock.calls[1][0].text;
      expect(message).toContain('No tools available');
      expect(commandResult).toEqual({ type: 'handled' });
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
      let commandResult: SlashCommandProcessorResult | false = false;
      await act(async () => {
        commandResult = await handleSlashCommand('/tools desc');
      });

      const message = mockAddItem.mock.calls[1][0].text;
      expect(message).toContain('Tool1');
      expect(message).toContain('Description for Tool1');
      expect(message).toContain('Tool2');
      expect(message).toContain('Description for Tool2');
      expect(commandResult).toEqual({ type: 'handled' });
    });
  });

  describe('/mcp command', () => {
    it('should show an error if tool registry is not available', async () => {
      mockConfig = {
        ...mockConfig,
        getToolRegistry: vi.fn().mockResolvedValue(undefined),
      } as unknown as Config;
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandProcessorResult | false = false;
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
      expect(commandResult).toEqual({ type: 'handled' });
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
      let commandResult: SlashCommandProcessorResult | false = false;
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
      expect(commandResult).toEqual({ type: 'handled' });
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
      let commandResult: SlashCommandProcessorResult | false = false;
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
      expect(commandResult).toEqual({ type: 'handled' });
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
      let commandResult: SlashCommandProcessorResult | false = false;
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

      expect(commandResult).toEqual({ type: 'handled' });
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
      let commandResult: SlashCommandProcessorResult | false = false;
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

      expect(commandResult).toEqual({ type: 'handled' });
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

      const mockServer2Tools: Array<{ name: string }> = [];

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
      let commandResult: SlashCommandProcessorResult | false = false;
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

      expect(commandResult).toEqual({ type: 'handled' });
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
      let commandResult: SlashCommandProcessorResult | false = false;
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

      expect(commandResult).toEqual({ type: 'handled' });
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
      let commandResult: SlashCommandProcessorResult | false = false;
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

      expect(commandResult).toEqual({ type: 'handled' });
    });
  });

  describe('/compress command', () => {
    it('should call tryCompressChat(true)', async () => {
      const hook = getProcessorHook();
      mockTryCompressChat.mockResolvedValue({
        originalTokenCount: 100,
        newTokenCount: 50,
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
