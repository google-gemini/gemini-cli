/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, getMCPServerPrompts } from '@google/gemini-cli-core';
import { McpPromptLoader } from './McpPromptLoader.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prompt } from '@modelcontextprotocol/sdk';
import { CommandContext } from '../ui/commands/types.js';

// Mock the core module
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getMCPServerPrompts: vi.fn(),
  };
});

describe('McpPromptLoader', () => {
  let config: Config;
  let loader: McpPromptLoader;
  const mockContext = {} as CommandContext;

  beforeEach(() => {
    vi.resetAllMocks();
    config = {
      getMcpServers: vi.fn().mockReturnValue({ 'test-server': {} }),
    } as unknown as Config;
    loader = new McpPromptLoader(config);
  });

  it('should handle multi-part responses from MCP servers', async () => {
    const mockPrompt: Prompt = {
      name: 'test-prompt',
      description: 'A test prompt',
      invoke: vi.fn().mockResolvedValue({
        messages: [
          {
            role: 'user',
            content: { text: 'Hello' },
          },
          {
            role: 'model',
            content: { text: 'Hi there!' },
          },
        ],
      }),
    };

    vi.mocked(getMCPServerPrompts).mockReturnValue([mockPrompt]);

    const commands = await loader.loadCommands(new AbortController().signal);
    expect(commands).toHaveLength(1);
    const command = commands[0];

    const result = await command.action!(mockContext, '');

    expect(result.type).toBe('submit_prompt');
    if (result.type === 'submit_prompt') {
      expect(result.content).toBe('user: Hello\n\nmodel: Hi there!');
    }
  });

  it('should handle single-part text responses', async () => {
    const mockPrompt: Prompt = {
      name: 'test-prompt',
      description: 'A test prompt',
      invoke: vi.fn().mockResolvedValue({
        messages: [
          {
            role: 'user',
            content: { text: 'Single message' },
          },
        ],
      }),
    };

    vi.mocked(getMCPServerPrompts).mockReturnValue([mockPrompt]);

    const commands = await loader.loadCommands(new AbortController().signal);
    const command = commands[0];
    const result = await command.action!(mockContext, '');

    expect(result.type).toBe('submit_prompt');
    if (result.type === 'submit_prompt') {
      expect(result.content).toBe('user: Single message');
    }
  });

  it('should handle responses where role is missing', async () => {
    const mockPrompt: Prompt = {
      name: 'test-prompt',
      description: 'A test prompt',
      invoke: vi.fn().mockResolvedValue({
        messages: [
          {
            content: { text: 'Message without role' },
          },
        ],
      }),
    };

    vi.mocked(getMCPServerPrompts).mockReturnValue([mockPrompt]);

    const commands = await loader.loadCommands(new AbortController().signal);
    const command = commands[0];
    const result = await command.action!(mockContext, '');

    expect(result.type).toBe('submit_prompt');
    if (result.type === 'submit_prompt') {
      expect(result.content).toBe('undefined: Message without role');
    }
  });

  it('should return an error for empty or invalid responses', async () => {
    const mockPrompt: Prompt = {
      name: 'test-prompt',
      description: 'A test prompt',
      invoke: vi.fn().mockResolvedValue({
        messages: [],
      }),
    };

    vi.mocked(getMCPServerPrompts).mockReturnValue([mockPrompt]);

    const commands = await loader.loadCommands(new AbortController().signal);
    const command = commands[0];
    const result = await command.action!(mockContext, '');

    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.messageType).toBe('error');
      expect(result.content).toBe(
        'Received an empty or invalid prompt response from the server.',
      );
    }
  });
});
