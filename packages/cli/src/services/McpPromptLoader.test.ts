/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpPromptLoader } from './McpPromptLoader.js';
import type { Config } from '@google/gemini-cli-core';
import type { PromptArgument } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandKind, type CommandContext } from '../ui/commands/types.js';
import * as cliCore from '@google/gemini-cli-core';

// Define the mock prompt data at a higher scope
const mockPrompt = {
  name: 'test-prompt',
  description: 'A test prompt.',
  serverName: 'test-server',
  arguments: [
    { name: 'name', required: true, description: "The animal's name." },
    { name: 'age', required: true, description: "The animal's age." },
    { name: 'species', required: true, description: "The animal's species." },
    {
      name: 'enclosure',
      required: false,
      description: "The animal's enclosure.",
    },
    { name: 'trail', required: false, description: "The animal's trail." },
  ],
  invoke: vi.fn().mockResolvedValue({
    messages: [{ content: { type: 'text', text: 'Hello, world!' } }],
  }),
};

describe('McpPromptLoader', () => {
  const mockConfig = {} as Config;

  // Use a beforeEach to set up and clean a spy for each test
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(cliCore, 'getMCPServerPrompts').mockReturnValue([mockPrompt]);
  });

  // --- `parseArgs` tests remain the same ---

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

  describe('loadCommands', () => {
    const mockConfigWithPrompts = {
      getMcpClientManager: () => ({
        getMcpServers: () => ({
          'test-server': { httpUrl: 'https://test-server.com' },
        }),
      }),
    } as unknown as Config;

    it('should load prompts as slash commands', async () => {
      const loader = new McpPromptLoader(mockConfigWithPrompts);
      const commands = await loader.loadCommands(new AbortController().signal);
      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('test-prompt');
      expect(commands[0].description).toBe('A test prompt.');
      expect(commands[0].kind).toBe(CommandKind.MCP_PROMPT);
    });

    it('should sanitize prompt names by replacing spaces with hyphens', async () => {
      const mockPromptWithSpaces = {
        ...mockPrompt,
        name: 'Prompt Name',
      };
      vi.spyOn(cliCore, 'getMCPServerPrompts').mockReturnValue([
        mockPromptWithSpaces,
      ]);

      const loader = new McpPromptLoader(mockConfigWithPrompts);
      const commands = await loader.loadCommands(new AbortController().signal);

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('Prompt-Name');
      expect(commands[0].kind).toBe(CommandKind.MCP_PROMPT);
    });

    it('should trim whitespace from prompt names before sanitizing', async () => {
      const mockPromptWithWhitespace = {
        ...mockPrompt,
        name: '  Prompt Name  ',
      };
      vi.spyOn(cliCore, 'getMCPServerPrompts').mockReturnValue([
        mockPromptWithWhitespace,
      ]);

      const loader = new McpPromptLoader(mockConfigWithPrompts);
      const commands = await loader.loadCommands(new AbortController().signal);

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('Prompt-Name');
      expect(commands[0].kind).toBe(CommandKind.MCP_PROMPT);
    });

    it('should handle prompt invocation successfully', async () => {
      const loader = new McpPromptLoader(mockConfigWithPrompts);
      const commands = await loader.loadCommands(new AbortController().signal);
      const action = commands[0].action!;
      const context = {} as CommandContext;
      const result = await action(context, 'test-name 123 tiger');
      expect(mockPrompt.invoke).toHaveBeenCalledWith({
        name: 'test-name',
        age: '123',
        species: 'tiger',
      });
      expect(result).toEqual({
        type: 'submit_prompt',
        content: JSON.stringify('Hello, world!'),
      });
    });

    it('should return an error for missing required arguments', async () => {
      const loader = new McpPromptLoader(mockConfigWithPrompts);
      const commands = await loader.loadCommands(new AbortController().signal);
      const action = commands[0].action!;
      const context = {} as CommandContext;
      const result = await action(context, 'test-name');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Missing required argument(s): --age, --species',
      });
    });

    it('should return an error message if prompt invocation fails', async () => {
      vi.spyOn(mockPrompt, 'invoke').mockRejectedValue(
        new Error('Invocation failed!'),
      );
      const loader = new McpPromptLoader(mockConfigWithPrompts);
      const commands = await loader.loadCommands(new AbortController().signal);
      const action = commands[0].action!;
      const context = {} as CommandContext;
      const result = await action(context, 'test-name 123 tiger');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Error: Invocation failed!',
      });
    });

    it('should return an empty array if config is not available', async () => {
      const loader = new McpPromptLoader(null);
      const commands = await loader.loadCommands(new AbortController().signal);
      expect(commands).toEqual([]);
    });

    describe('autoExecute', () => {
      it('should set autoExecute to true for prompts with no arguments (undefined)', async () => {
        vi.spyOn(cliCore, 'getMCPServerPrompts').mockReturnValue([
          { ...mockPrompt, arguments: undefined },
        ]);
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        expect(commands[0].autoExecute).toBe(true);
      });

      it('should set autoExecute to true for prompts with empty arguments array', async () => {
        vi.spyOn(cliCore, 'getMCPServerPrompts').mockReturnValue([
          { ...mockPrompt, arguments: [] },
        ]);
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        expect(commands[0].autoExecute).toBe(true);
      });

      it('should set autoExecute to false for prompts with only optional arguments', async () => {
        vi.spyOn(cliCore, 'getMCPServerPrompts').mockReturnValue([
          {
            ...mockPrompt,
            arguments: [{ name: 'optional', required: false }],
          },
        ]);
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        expect(commands[0].autoExecute).toBe(false);
      });

      it('should set autoExecute to false for prompts with required arguments', async () => {
        vi.spyOn(cliCore, 'getMCPServerPrompts').mockReturnValue([
          {
            ...mockPrompt,
            arguments: [{ name: 'required', required: true }],
          },
        ]);
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        expect(commands[0].autoExecute).toBe(false);
      });
    });

    describe('completion', () => {
      it('should suggest no arguments when using positional arguments', async () => {
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        const completion = commands[0].completion!;
        const context = {} as CommandContext;
        const suggestions = await completion(context, 'test-name 6 tiger');
        expect(suggestions).toEqual([]);
      });

      it('should suggest all arguments when none are present', async () => {
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        const completion = commands[0].completion!;
        const context = {
          invocation: {
            raw: '/find ',
            name: 'find',
            args: '',
          },
        } as CommandContext;
        const suggestions = await completion(context, '');
        expect(suggestions).toEqual([
          '--name="',
          '--age="',
          '--species="',
          '--enclosure="',
          '--trail="',
        ]);
      });

      it('should suggest remaining arguments when some are present', async () => {
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        const completion = commands[0].completion!;
        const context = {
          invocation: {
            raw: '/find --name="test-name" --age="6" ',
            name: 'find',
            args: '--name="test-name" --age="6"',
          },
        } as CommandContext;
        const suggestions = await completion(context, '');
        expect(suggestions).toEqual([
          '--species="',
          '--enclosure="',
          '--trail="',
        ]);
      });

      it('should suggest no arguments when all are present', async () => {
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        const completion = commands[0].completion!;
        const context = {} as CommandContext;
        const suggestions = await completion(
          context,
          '--name="test-name" --age="6" --species="tiger" --enclosure="Tiger Den" --trail="Jungle"',
        );
        expect(suggestions).toEqual([]);
      });

      it('should suggest nothing for prompts with no arguments', async () => {
        // Temporarily override the mock to return a prompt with no args
        vi.spyOn(cliCore, 'getMCPServerPrompts').mockReturnValue([
          { ...mockPrompt, arguments: [] },
        ]);
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        const completion = commands[0].completion!;
        const context = {} as CommandContext;
        const suggestions = await completion(context, '');
        expect(suggestions).toEqual([]);
      });

      it('should suggest arguments matching a partial argument', async () => {
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        const completion = commands[0].completion!;
        const context = {
          invocation: {
            raw: '/find --s',
            name: 'find',
            args: '--s',
          },
        } as CommandContext;
        const suggestions = await completion(context, '--s');
        expect(suggestions).toEqual(['--species="']);
      });

      it('should suggest arguments even when a partial argument is parsed as a value', async () => {
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        const completion = commands[0].completion!;
        const context = {
          invocation: {
            raw: '/find --name="test" --a',
            name: 'find',
            args: '--name="test" --a',
          },
        } as CommandContext;
        const suggestions = await completion(context, '--a');
        expect(suggestions).toEqual(['--age="']);
      });

      it('should auto-close the quote for a named argument value', async () => {
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        const completion = commands[0].completion!;
        const context = {
          invocation: {
            raw: '/find --name="test',
            name: 'find',
            args: '--name="test',
          },
        } as CommandContext;
        const suggestions = await completion(context, '--name="test');
        expect(suggestions).toEqual(['--name="test"']);
      });

      it('should auto-close the quote for an empty named argument value', async () => {
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        const completion = commands[0].completion!;
        const context = {
          invocation: {
            raw: '/find --name="',
            name: 'find',
            args: '--name="',
          },
        } as CommandContext;
        const suggestions = await completion(context, '--name="');
        expect(suggestions).toEqual(['--name=""']);
      });

      it('should not add a quote if already present', async () => {
        const loader = new McpPromptLoader(mockConfigWithPrompts);
        const commands = await loader.loadCommands(
          new AbortController().signal,
        );
        const completion = commands[0].completion!;
        const context = {
          invocation: {
            raw: '/find --name="test"',
            name: 'find',
            args: '--name="test"',
          },
        } as CommandContext;
        const suggestions = await completion(context, '--name="test"');
        expect(suggestions).toEqual([]);
      });
    });
  });
});
