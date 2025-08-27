/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpPromptLoader } from './McpPromptLoader.js';
import type { Config, DiscoveredMCPPrompt } from '@google/gemini-cli-core';
import { getMCPServerPrompts } from '@google/gemini-cli-core';
import type { PromptArgument } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandKind } from '../ui/commands/types.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getMCPServerPrompts: vi.fn(),
  };
});

describe('McpPromptLoader', () => {
  const mockConfig = {} as Config;

  describe('loadCommands', () => {
    const mockGetMcpServers = vi.fn();
    const mockConfigWithServers = {
      getMcpServers: mockGetMcpServers,
    } as unknown as Config;

    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should return no commands if no MCP servers are configured', async () => {
      mockGetMcpServers.mockReturnValue({});
      const loader = new McpPromptLoader(mockConfigWithServers);
      const commands = await loader.loadCommands(new AbortController().signal);
      expect(commands).toEqual([]);
      expect(mockGetMcpServers).toHaveBeenCalled();
    });

    it('should load commands from a single server with a single prompt', async () => {
      mockGetMcpServers.mockReturnValue({ 'test-server': {} });
      const mockPrompt: DiscoveredMCPPrompt = {
        name: 'my-prompt',
        description: 'A test prompt.',
        arguments: [],
        serverName: 'test-server',
        invoke: vi.fn(),
      };
      vi.mocked(getMCPServerPrompts).mockReturnValue([mockPrompt]);

      const loader = new McpPromptLoader(mockConfigWithServers);
      const commands = await loader.loadCommands(new AbortController().signal);

      expect(commands).toHaveLength(1);
      const command = commands[0];
      expect(command.name).toBe('my-prompt');
      expect(command.description).toBe('A test prompt.');
      expect(command.kind).toBe(CommandKind.MCP_PROMPT);
      expect(command.mcpServerName).toBe('test-server');
      expect(command.subCommands).toHaveLength(1);
      expect(command.subCommands?.[0].name).toBe('help');
    });

    it('should use a default description if prompt has none', async () => {
      mockGetMcpServers.mockReturnValue({ 'test-server': {} });
      const mockPrompt: DiscoveredMCPPrompt = {
        name: 'my-prompt',
        // No description
        arguments: [],
        serverName: 'test-server',
        invoke: vi.fn(),
      };
      vi.mocked(getMCPServerPrompts).mockReturnValue([mockPrompt]);

      const loader = new McpPromptLoader(mockConfigWithServers);
      const commands = await loader.loadCommands(new AbortController().signal);

      expect(commands).toHaveLength(1);
      expect(commands[0].description).toBe('Invoke prompt my-prompt');
    });

    it('should load commands from multiple servers and prompts', async () => {
      mockGetMcpServers.mockReturnValue({ server1: {}, server2: {} });
      const mockPrompt1: DiscoveredMCPPrompt = {
        name: 'prompt1',
        description: 'Prompt 1',
        arguments: [],
        serverName: 'server1',
        invoke: vi.fn(),
      };
      const mockPrompt2: DiscoveredMCPPrompt = {
        name: 'prompt2',
        description: 'Prompt 2',
        arguments: [],
        serverName: 'server1',
        invoke: vi.fn(),
      };
      const mockPrompt3: DiscoveredMCPPrompt = {
        name: 'prompt3',
        description: 'Prompt 3',
        arguments: [],
        serverName: 'server2',
        invoke: vi.fn(),
      };

      vi.mocked(getMCPServerPrompts).mockImplementation(
        (_config, serverName) => {
          if (serverName === 'server1') {
            return [mockPrompt1, mockPrompt2];
          }
          if (serverName === 'server2') {
            return [mockPrompt3];
          }
          return [];
        },
      );

      const loader = new McpPromptLoader(mockConfigWithServers);
      const commands = await loader.loadCommands(new AbortController().signal);

      expect(commands).toHaveLength(3);
      expect(commands.map((c) => c.name)).toEqual([
        'prompt1',
        'prompt2',
        'prompt3',
      ]);
      expect(commands[0].mcpServerName).toBe('server1');
      expect(commands[1].mcpServerName).toBe('server1');
      expect(commands[2].mcpServerName).toBe('server2');
    });

    it('should handle a server with no prompts and a server with prompts', async () => {
      mockGetMcpServers.mockReturnValue({
        'empty-server': {},
        'full-server': {},
      });
      const mockPrompt: DiscoveredMCPPrompt = {
        name: 'my-prompt',
        description: 'A test prompt.',
        arguments: [],
        serverName: 'full-server',
        invoke: vi.fn(),
      };

      vi.mocked(getMCPServerPrompts).mockImplementation(
        (_config, serverName) => {
          if (serverName === 'empty-server') {
            return [];
          }
          if (serverName === 'full-server') {
            return [mockPrompt];
          }
          return [];
        },
      );

      const loader = new McpPromptLoader(mockConfigWithServers);
      const commands = await loader.loadCommands(new AbortController().signal);

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('my-prompt');
      expect(commands[0].mcpServerName).toBe('full-server');
    });
  });

  describe('parseArgs', () => {
    it('should handle multi-word positional arguments', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'arg1', required: true },
        { name: 'arg2', required: true },
      ];
      const userArgs = 'hello world';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: 'hello', arg2: 'world' });
    });

    it('should handle quoted multi-word positional arguments', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'arg1', required: true },
        { name: 'arg2', required: true },
      ];
      const userArgs = '"hello world" foo';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: 'hello world', arg2: 'foo' });
    });

    it('should handle a single positional argument with multiple words', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [{ name: 'arg1', required: true }];
      const userArgs = 'hello world';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: 'hello world' });
    });

    it('should handle escaped quotes in positional arguments', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [{ name: 'arg1', required: true }];
      const userArgs = '"hello \\"world\\""';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: 'hello "world"' });
    });

    it('should handle escaped backslashes in positional arguments', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [{ name: 'arg1', required: true }];
      const userArgs = '"hello\\\\world"';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: 'hello\\world' });
    });

    it('should handle named args followed by positional args', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'named', required: true },
        { name: 'pos', required: true },
      ];
      const userArgs = '--named="value" positional';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ named: 'value', pos: 'positional' });
    });

    it('should handle positional args followed by named args', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'pos', required: true },
        { name: 'named', required: true },
      ];
      const userArgs = 'positional --named="value"';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ pos: 'positional', named: 'value' });
    });

    it('should handle positional args interspersed with named args', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'pos1', required: true },
        { name: 'named', required: true },
        { name: 'pos2', required: true },
      ];
      const userArgs = 'p1 --named="value" p2';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ pos1: 'p1', named: 'value', pos2: 'p2' });
    });

    it('should treat an escaped quote at the start as a literal', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'arg1', required: true },
        { name: 'arg2', required: true },
      ];
      const userArgs = '\\"hello world';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: '"hello', arg2: 'world' });
    });

    it('should handle a complex mix of args', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'pos1', required: true },
        { name: 'named1', required: true },
        { name: 'pos2', required: true },
        { name: 'named2', required: true },
        { name: 'pos3', required: true },
      ];
      const userArgs =
        'p1 --named1="value 1" "p2 has spaces" --named2=value2 "p3 \\"with quotes\\""';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({
        pos1: 'p1',
        named1: 'value 1',
        pos2: 'p2 has spaces',
        named2: 'value2',
        pos3: 'p3 "with quotes"',
      });
    });
  });
});
