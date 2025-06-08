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

import { act, renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import open from 'open';
import {
  useSlashCommandProcessor,
  type SlashCommandActionReturn,
} from './slashCommandProcessor.js';
import { MessageType } from '../types.js';
import {
  type Config,
  MCPServerStatus,
  getMCPServerStatus,
} from '@gemini-cli/core';
import { useSession } from '../contexts/SessionContext.js';

import * as ShowMemoryCommandModule from './useShowMemoryCommand.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';

vi.mock('../contexts/SessionContext.js', () => ({
  useSession: vi.fn(),
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
  let mockRefreshStatic: ReturnType<typeof vi.fn>;
  let mockSetShowHelp: ReturnType<typeof vi.fn>;
  let mockOnDebugMessage: ReturnType<typeof vi.fn>;
  let mockOpenThemeDialog: ReturnType<typeof vi.fn>;
  let mockPerformMemoryRefresh: ReturnType<typeof vi.fn>;
  let mockConfig: Config;
  let mockCorgiMode: ReturnType<typeof vi.fn>;
  const mockUseSession = useSession as Mock;

  beforeEach(() => {
    mockAddItem = vi.fn();
    mockClearItems = vi.fn();
    mockRefreshStatic = vi.fn();
    mockSetShowHelp = vi.fn();
    mockOnDebugMessage = vi.fn();
    mockOpenThemeDialog = vi.fn();
    mockPerformMemoryRefresh = vi.fn().mockResolvedValue(undefined);
    mockConfig = {
      getDebugMode: vi.fn(() => false),
      getSandbox: vi.fn(() => 'test-sandbox'),
      getModel: vi.fn(() => 'test-model'),
    } as unknown as Config;
    mockCorgiMode = vi.fn();
    mockUseSession.mockReturnValue({
      startTime: new Date('2025-01-01T00:00:00.000Z'),
    });

    (open as Mock).mockClear();
    mockProcessExit.mockClear();
    (ShowMemoryCommandModule.createShowMemoryAction as Mock).mockClear();
    mockPerformMemoryRefresh.mockClear();
    process.env = { ...globalThis.process.env };
  });

  const getProcessor = (showToolDescriptions: boolean = false) => {
    const { result } = renderHook(() =>
      useSlashCommandProcessor(
        mockConfig,
        mockAddItem,
        mockClearItems,
        mockRefreshStatic,
        mockSetShowHelp,
        mockOnDebugMessage,
        mockOpenThemeDialog,
        mockPerformMemoryRefresh,
        mockCorgiMode,
        showToolDescriptions,
      ),
    );
    return result.current;
  };

  describe('/memory add', () => {
    it('should return tool scheduling info on valid input', async () => {
      const { handleSlashCommand } = getProcessor();
      const fact = 'Remember this fact';
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand(`/memory add ${fact}`);
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
        commandResult = handleSlashCommand('/memory add ');
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
        commandResult = handleSlashCommand('/memory show');
      });
      expect(
        ShowMemoryCommandModule.createShowMemoryAction,
      ).toHaveBeenCalledWith(mockConfig, expect.any(Function));
      expect(mockReturnedShowAction).toHaveBeenCalled();
      expect(commandResult).toBe(true);
    });
  });

  describe('/memory refresh', () => {
    it('should call performMemoryRefresh and return true', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand('/memory refresh');
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
        commandResult = handleSlashCommand('/memory foobar');
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
    it('should show the session duration', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;

      // Mock current time
      const mockDate = new Date('2025-01-01T00:01:05.000Z');
      vi.setSystemTime(mockDate);

      await act(async () => {
        commandResult = handleSlashCommand('/stats');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Session duration: 1m 5s',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);

      // Restore system time
      vi.useRealTimers();
    });
  });

  describe('Other commands', () => {
    it('/help should open help and return true', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand('/help');
      });
      expect(mockSetShowHelp).toHaveBeenCalledWith(true);
      expect(commandResult).toBe(true);
    });
  });

  describe('/bug command', () => {
    const originalEnv = process.env;
    beforeEach(() => {
      vi.resetModules();
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

      const diagnosticInfo = `
## Describe the bug
A clear and concise description of what the bug is.

## Additional context
Add any other context about the problem here.

## Diagnostic Information
*   **CLI Version:** ${cliVersion}
*   **Git Commit:** ${GIT_COMMIT_INFO}
*   **Operating System:** ${osVersion}
*   **Sandbox Environment:** ${sandboxEnvStr}
*   **Model Version:** ${modelVersion}
*   **Memory Usage:** ${memoryUsage}
`;
      let url =
        'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.md';
      if (description) {
        url += `&title=${encodeURIComponent(description)}`;
      }
      url += `&body=${encodeURIComponent(diagnosticInfo)}`;
      return url;
    };

    it('should call open with the correct GitHub issue URL and return true', async () => {
      process.env.SANDBOX = 'gemini-sandbox';
      process.env.SEATBELT_PROFILE = 'test_profile';
      process.env.CLI_VERSION = 'test-version';
      const { handleSlashCommand } = getProcessor();
      const bugDescription = 'This is a test bug';
      const expectedUrl = getExpectedUrl(
        bugDescription,
        process.env.SANDBOX,
        process.env.SEATBELT_PROFILE,
        process.env.CLI_VERSION,
      );
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand(`/bug ${bugDescription}`);
      });

      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(open).toHaveBeenCalledWith(expectedUrl);
      expect(commandResult).toBe(true);
    });
  });

  describe('Unknown command', () => {
    it('should show an error and return true for a general unknown command', async () => {
      const { handleSlashCommand } = getProcessor();
      let commandResult: SlashCommandActionReturn | boolean = false;
      await act(async () => {
        commandResult = handleSlashCommand('/unknowncommand');
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
        commandResult = handleSlashCommand('/tools');
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
        commandResult = handleSlashCommand('/tools');
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
        commandResult = handleSlashCommand('/tools');
      });

      // Should only show tool1 and tool2, not the MCP tools
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Available Gemini CLI tools:\n\nTool1\nTool2',
        }),
        expect.any(Number),
      );
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
        commandResult = handleSlashCommand('/tools');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Available Gemini CLI tools:\n\n',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
    });
  });

  describe('/mcp command', () => {
    beforeEach(() => {
      // Mock the core module with getMCPServerStatus
      vi.mock('@gemini-cli/core', async (importOriginal) => {
        const actual = await importOriginal();
        return {
          ...actual,
          MCPServerStatus: {
            CONNECTED: 'connected',
            CONNECTING: 'connecting',
            DISCONNECTED: 'disconnected',
          },
          getMCPServerStatus: vi.fn(),
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
        commandResult = handleSlashCommand('/mcp');
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

    it('should display a message when no MCP servers are configured', async () => {
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
        commandResult = handleSlashCommand('/mcp');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'No MCP servers configured.',
        }),
        expect.any(Number),
      );
      expect(commandResult).toBe(true);
    });

    it('should display configured MCP servers with status indicators and their tools', async () => {
      // Mock MCP servers configuration
      const mockMcpServers = {
        server1: { command: 'cmd1' },
        server2: { command: 'cmd2' },
        server3: { command: 'cmd3' },
      };

      // Setup getMCPServerStatus mock implementation
      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        if (serverName === 'server2') return MCPServerStatus.CONNECTING;
        return MCPServerStatus.DISCONNECTED; // Default for server3 and others
      });

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
        commandResult = handleSlashCommand('/mcp');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Configured MCP servers and tools:'),
        }),
        expect.any(Number),
      );

      // Check that the message contains details about both servers and their tools
      const message = mockAddItem.mock.calls[1][0].text;
      // Server 1 - Connected (green dot)
      expect(message).toContain('🟢 \u001b[1mserver1\u001b[0m (2 tools)');
      expect(message).toContain('\u001b[36mserver1_tool1\u001b[0m');
      expect(message).toContain('\u001b[36mserver1_tool2\u001b[0m');

      // Server 2 - Connecting (yellow dot)
      expect(message).toContain('🟡 \u001b[1mserver2\u001b[0m (1 tools)');
      expect(message).toContain('\u001b[36mserver2_tool1\u001b[0m');

      // Server 3 - No status, should default to Disconnected (red dot)
      expect(message).toContain('🔴 \u001b[1mserver3\u001b[0m (1 tools)');
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
        commandResult = handleSlashCommand('/mcp');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Configured MCP servers and tools:'),
        }),
        expect.any(Number),
      );

      const message = mockAddItem.mock.calls[1][0].text;

      // Check that server description is included (with ANSI color codes)
      expect(message).toContain('\u001b[1mserver1\u001b[0m (2 tools)');
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
        commandResult = handleSlashCommand('/mcp');
      });

      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Configured MCP servers and tools:'),
        }),
        expect.any(Number),
      );

      // Check that the message contains details about both servers and their tools
      const message = mockAddItem.mock.calls[1][0].text;
      expect(message).toContain('🟢 \u001b[1mserver1\u001b[0m (1 tools)');
      expect(message).toContain('\u001b[36mserver1_tool1\u001b[0m');
      expect(message).toContain('🔴 \u001b[1mserver2\u001b[0m (0 tools)');
      expect(message).toContain('No tools available');

      expect(commandResult).toBe(true);
    });
  });
});
