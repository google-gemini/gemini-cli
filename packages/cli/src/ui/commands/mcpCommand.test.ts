/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mcpCommand } from './mcpCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import {
  MCPServerStatus,
  MCPDiscoveryState,
  getMCPServerStatus,
  getMCPDiscoveryState,
  DiscoveredMCPTool,
} from '@google/gemini-cli-core';
import open from 'open';
import { MessageActionReturn } from './types.js';
import { Type, CallableTool } from '@google/genai';

// Mock external dependencies
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

// Helper function to check if result is a message action
const isMessageAction = (result: unknown): result is MessageActionReturn =>
  result !== null &&
  typeof result === 'object' &&
  'type' in result &&
  result.type === 'message';

// Helper function to create a mock DiscoveredMCPTool
const createMockMCPTool = (
  name: string,
  serverName: string,
  description?: string,
) =>
  new DiscoveredMCPTool(
    {
      callTool: vi.fn(),
      tool: vi.fn(),
    } as unknown as CallableTool,
    serverName,
    name,
    description || `Description for ${name}`,
    { type: Type.OBJECT, properties: {} },
    name, // serverToolName same as name for simplicity
  );

describe('mcpCommand', () => {
  let mockContext: ReturnType<typeof createMockCommandContext>;
  let mockConfig: {
    getToolRegistry: ReturnType<typeof vi.fn>;
    getMcpServers: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock environment
    delete process.env.SANDBOX;

    // Default mock implementations
    vi.mocked(getMCPServerStatus).mockReturnValue(MCPServerStatus.CONNECTED);
    vi.mocked(getMCPDiscoveryState).mockReturnValue(
      MCPDiscoveryState.COMPLETED,
    );

    // Create mock config with all necessary methods
    mockConfig = {
      getToolRegistry: vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue([]),
      }),
      getMcpServers: vi.fn().mockReturnValue({}),
    };

    mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
      },
    });
  });

  describe('basic functionality', () => {
    it('should show an error if config is not available', async () => {
      const contextWithoutConfig = createMockCommandContext({
        services: {
          config: null,
        },
      });

      const result = await mcpCommand.action!(contextWithoutConfig, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      });
    });

    it('should show an error if tool registry is not available', async () => {
      mockConfig.getToolRegistry = vi.fn().mockResolvedValue(undefined);

      const result = await mcpCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Could not retrieve tool registry.',
      });
    });
  });

  describe('no MCP servers configured', () => {
    beforeEach(() => {
      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue([]),
      });
      mockConfig.getMcpServers = vi.fn().mockReturnValue({});
    });

    it('should display a message with a URL when no MCP servers are configured in a sandbox', async () => {
      process.env.SANDBOX = 'sandbox';

      const result = await mcpCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content:
          'No MCP servers configured. Please open the following URL in your browser to view documentation:\nhttps://goo.gle/gemini-cli-docs-mcp',
      });
      expect(open).not.toHaveBeenCalled();
    });

    it('should display a message and open a URL when no MCP servers are configured outside a sandbox', async () => {
      const result = await mcpCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content:
          'No MCP servers configured. Opening documentation in your browser: https://goo.gle/gemini-cli-docs-mcp',
      });
      expect(open).toHaveBeenCalledWith('https://goo.gle/gemini-cli-docs-mcp');
    });
  });

  describe('with configured MCP servers', () => {
    beforeEach(() => {
      const mockMcpServers = {
        server1: { command: 'cmd1' },
        server2: { command: 'cmd2' },
        server3: { command: 'cmd3' },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);
    });

    it('should display configured MCP servers with status indicators and their tools', async () => {
      // Setup getMCPServerStatus mock implementation
      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        if (serverName === 'server2') return MCPServerStatus.CONNECTED;
        return MCPServerStatus.DISCONNECTED; // server3
      });

      // Mock tools from each server using actual DiscoveredMCPTool instances
      const mockServer1Tools = [
        createMockMCPTool('server1_tool1', 'server1'),
        createMockMCPTool('server1_tool2', 'server1'),
      ];
      const mockServer2Tools = [createMockMCPTool('server2_tool1', 'server2')];
      const mockServer3Tools = [createMockMCPTool('server3_tool1', 'server3')];

      const allTools = [
        ...mockServer1Tools,
        ...mockServer2Tools,
        ...mockServer3Tools,
      ];

      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue(allTools),
      });

      const result = await mcpCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Configured MCP servers:'),
      });

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        // Server 1 - Connected
        expect(message).toContain(
          '🟢 \u001b[1mserver1\u001b[0m - Ready (2 tools)',
        );
        expect(message).toContain('server1_tool1');
        expect(message).toContain('server1_tool2');

        // Server 2 - Connected
        expect(message).toContain(
          '🟢 \u001b[1mserver2\u001b[0m - Ready (1 tools)',
        );
        expect(message).toContain('server2_tool1');

        // Server 3 - Disconnected
        expect(message).toContain(
          '🔴 \u001b[1mserver3\u001b[0m - Disconnected (1 tools cached)',
        );
        expect(message).toContain('server3_tool1');

        // Check that helpful tips are displayed when no arguments are provided
        expect(message).toContain('💡 Tips:');
        expect(message).toContain('/mcp desc');
        expect(message).toContain('/mcp schema');
        expect(message).toContain('/mcp nodesc');
        expect(message).toContain('Ctrl+T');
      }
    });

    it('should display tool descriptions when desc argument is used', async () => {
      const mockMcpServers = {
        server1: {
          command: 'cmd1',
          description: 'This is a server description',
        },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);

      // Mock tools with descriptions using actual DiscoveredMCPTool instances
      const mockServerTools = [
        createMockMCPTool('tool1', 'server1', 'This is tool 1 description'),
        createMockMCPTool('tool2', 'server1', 'This is tool 2 description'),
      ];

      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue(mockServerTools),
      });

      const result = await mcpCommand.action!(mockContext, 'desc');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Configured MCP servers:'),
      });

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;

        // Check that server description is included
        expect(message).toContain(
          '\u001b[1mserver1\u001b[0m - Ready (2 tools)',
        );
        expect(message).toContain(
          '\u001b[32mThis is a server description\u001b[0m',
        );

        // Check that tool descriptions are included
        expect(message).toContain('\u001b[36mtool1\u001b[0m');
        expect(message).toContain(
          '\u001b[32mThis is tool 1 description\u001b[0m',
        );
        expect(message).toContain('\u001b[36mtool2\u001b[0m');
        expect(message).toContain(
          '\u001b[32mThis is tool 2 description\u001b[0m',
        );

        // Check that tips are NOT displayed when arguments are provided
        expect(message).not.toContain('💡 Tips:');
      }
    });

    it('should not display descriptions when nodesc argument is used', async () => {
      const mockMcpServers = {
        server1: {
          command: 'cmd1',
          description: 'This is a server description',
        },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);

      const mockServerTools = [
        createMockMCPTool('tool1', 'server1', 'This is tool 1 description'),
      ];

      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue(mockServerTools),
      });

      const result = await mcpCommand.action!(mockContext, 'nodesc');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Configured MCP servers:'),
      });

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;

        // Check that descriptions are not included
        expect(message).not.toContain('This is a server description');
        expect(message).not.toContain('This is tool 1 description');
        expect(message).toContain('\u001b[36mtool1\u001b[0m');

        // Check that tips are NOT displayed when arguments are provided
        expect(message).not.toContain('💡 Tips:');
      }
    });

    it('should indicate when a server has no tools', async () => {
      const mockMcpServers = {
        server1: { command: 'cmd1' },
        server2: { command: 'cmd2' },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);

      // Setup server statuses
      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        if (serverName === 'server2') return MCPServerStatus.DISCONNECTED;
        return MCPServerStatus.DISCONNECTED;
      });

      // Mock tools - only server1 has tools
      const mockServerTools = [createMockMCPTool('server1_tool1', 'server1')];

      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue(mockServerTools),
      });

      const result = await mcpCommand.action!(mockContext, '');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).toContain(
          '🟢 \u001b[1mserver1\u001b[0m - Ready (1 tools)',
        );
        expect(message).toContain('\u001b[36mserver1_tool1\u001b[0m');
        expect(message).toContain(
          '🔴 \u001b[1mserver2\u001b[0m - Disconnected (0 tools cached)',
        );
        expect(message).toContain('No tools available');
      }
    });

    it('should show startup indicator when servers are connecting', async () => {
      const mockMcpServers = {
        server1: { command: 'cmd1' },
        server2: { command: 'cmd2' },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);

      // Setup server statuses with one connecting
      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        if (serverName === 'server2') return MCPServerStatus.CONNECTING;
        return MCPServerStatus.DISCONNECTED;
      });

      // Setup discovery state as in progress
      vi.mocked(getMCPDiscoveryState).mockReturnValue(
        MCPDiscoveryState.IN_PROGRESS,
      );

      // Mock tools
      const mockServerTools = [
        createMockMCPTool('server1_tool1', 'server1'),
        createMockMCPTool('server2_tool1', 'server2'),
      ];

      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue(mockServerTools),
      });

      const result = await mcpCommand.action!(mockContext, '');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;

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
      }
    });
  });

  describe('schema functionality', () => {
    it('should display tool schemas when schema argument is used', async () => {
      const mockMcpServers = {
        server1: {
          command: 'cmd1',
          description: 'This is a server description',
        },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);

      // Create tools with parameter schemas
      const mockCallableTool1: CallableTool = {
        callTool: vi.fn(),
        tool: vi.fn(),
      } as unknown as CallableTool;
      const mockCallableTool2: CallableTool = {
        callTool: vi.fn(),
        tool: vi.fn(),
      } as unknown as CallableTool;

      const tool1 = new DiscoveredMCPTool(
        mockCallableTool1,
        'server1',
        'tool1',
        'This is tool 1 description',
        {
          type: Type.OBJECT,
          properties: {
            param1: { type: Type.STRING, description: 'First parameter' },
          },
          required: ['param1'],
        },
        'tool1',
      );

      const tool2 = new DiscoveredMCPTool(
        mockCallableTool2,
        'server1',
        'tool2',
        'This is tool 2 description',
        {
          type: Type.OBJECT,
          properties: {
            param2: { type: Type.NUMBER, description: 'Second parameter' },
          },
          required: ['param2'],
        },
        'tool2',
      );

      const mockServerTools = [tool1, tool2];

      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue(mockServerTools),
      });

      const result = await mcpCommand.action!(mockContext, 'schema');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Configured MCP servers:'),
      });

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;

        // Check that server description is included
        expect(message).toContain('Ready (2 tools)');
        expect(message).toContain('This is a server description');

        // Check that tool descriptions and schemas are included
        expect(message).toContain('This is tool 1 description');
        expect(message).toContain('Parameters:');
        expect(message).toContain('param1');
        expect(message).toContain('STRING');
        expect(message).toContain('This is tool 2 description');
        expect(message).toContain('param2');
        expect(message).toContain('NUMBER');
      }
    });

    it('should handle tools without parameter schemas gracefully', async () => {
      const mockMcpServers = {
        server1: { command: 'cmd1' },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);

      // Mock tools without parameter schemas
      const mockServerTools = [
        createMockMCPTool('tool1', 'server1', 'Tool without schema'),
      ];

      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue(mockServerTools),
      });

      const result = await mcpCommand.action!(mockContext, 'schema');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Configured MCP servers:'),
      });

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).toContain('tool1');
        expect(message).toContain('Tool without schema');
        // Should not crash when parameterSchema is undefined
      }
    });
  });

  describe('argument parsing', () => {
    beforeEach(() => {
      const mockMcpServers = {
        server1: {
          command: 'cmd1',
          description: 'Server description',
        },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);

      const mockServerTools = [
        createMockMCPTool('tool1', 'server1', 'Test tool'),
      ];

      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue(mockServerTools),
      });
    });

    it('should handle "descriptions" as alias for "desc"', async () => {
      const result = await mcpCommand.action!(mockContext, 'descriptions');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).toContain('Test tool');
        expect(message).toContain('Server description');
      }
    });

    it('should handle "nodescriptions" as alias for "nodesc"', async () => {
      const result = await mcpCommand.action!(mockContext, 'nodescriptions');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).not.toContain('Test tool');
        expect(message).not.toContain('Server description');
        expect(message).toContain('\u001b[36mtool1\u001b[0m');
      }
    });

    it('should handle mixed case arguments', async () => {
      const result = await mcpCommand.action!(mockContext, 'DESC');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).toContain('Test tool');
        expect(message).toContain('Server description');
      }
    });

    it('should handle multiple arguments - "schema desc"', async () => {
      const result = await mcpCommand.action!(mockContext, 'schema desc');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).toContain('Test tool');
        expect(message).toContain('Server description');
        expect(message).toContain('Parameters:');
      }
    });

    it('should handle multiple arguments - "desc schema"', async () => {
      const result = await mcpCommand.action!(mockContext, 'desc schema');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).toContain('Test tool');
        expect(message).toContain('Server description');
        expect(message).toContain('Parameters:');
      }
    });

    it('should handle "schema" alone showing descriptions', async () => {
      const result = await mcpCommand.action!(mockContext, 'schema');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).toContain('Test tool');
        expect(message).toContain('Server description');
        expect(message).toContain('Parameters:');
      }
    });

    it('should handle "nodesc" overriding "schema" - "schema nodesc"', async () => {
      const result = await mcpCommand.action!(mockContext, 'schema nodesc');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).not.toContain('Test tool');
        expect(message).not.toContain('Server description');
        expect(message).toContain('Parameters:'); // Schema should still show
        expect(message).toContain('\u001b[36mtool1\u001b[0m');
      }
    });

    it('should handle "nodesc" overriding "desc" - "desc nodesc"', async () => {
      const result = await mcpCommand.action!(mockContext, 'desc nodesc');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).not.toContain('Test tool');
        expect(message).not.toContain('Server description');
        expect(message).not.toContain('Parameters:');
        expect(message).toContain('\u001b[36mtool1\u001b[0m');
      }
    });

    it('should handle "nodesc" overriding both "desc" and "schema" - "desc schema nodesc"', async () => {
      const result = await mcpCommand.action!(
        mockContext,
        'desc schema nodesc',
      );

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).not.toContain('Test tool');
        expect(message).not.toContain('Server description');
        expect(message).toContain('Parameters:'); // Schema should still show
        expect(message).toContain('\u001b[36mtool1\u001b[0m');
      }
    });

    it('should handle extra whitespace in arguments', async () => {
      const result = await mcpCommand.action!(mockContext, '  desc   schema  ');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).toContain('Test tool');
        expect(message).toContain('Server description');
        expect(message).toContain('Parameters:');
      }
    });

    it('should handle empty arguments gracefully', async () => {
      const result = await mcpCommand.action!(mockContext, '');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).not.toContain('Test tool');
        expect(message).not.toContain('Server description');
        expect(message).not.toContain('Parameters:');
        expect(message).toContain('\u001b[36mtool1\u001b[0m');
      }
    });

    it('should handle unknown arguments gracefully', async () => {
      const result = await mcpCommand.action!(mockContext, 'unknown arg');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).not.toContain('Test tool');
        expect(message).not.toContain('Server description');
        expect(message).not.toContain('Parameters:');
        expect(message).toContain('\u001b[36mtool1\u001b[0m');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty server names gracefully', async () => {
      const mockMcpServers = {
        '': { command: 'cmd1' }, // Empty server name
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);
      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue([]),
      });

      const result = await mcpCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Configured MCP servers:'),
      });
    });

    it('should handle servers with special characters in names', async () => {
      const mockMcpServers = {
        'server-with-dashes': { command: 'cmd1' },
        server_with_underscores: { command: 'cmd2' },
        'server.with.dots': { command: 'cmd3' },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);
      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue([]),
      });

      const result = await mcpCommand.action!(mockContext, '');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).toContain('server-with-dashes');
        expect(message).toContain('server_with_underscores');
        expect(message).toContain('server.with.dots');
      }
    });
  });
});
