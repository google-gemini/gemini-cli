/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpPromptLoader } from './McpPromptLoader.js';
import type { Config } from '@google/gemini-cli-core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cliCore from '@google/gemini-cli-core';
import { sanitizeMcpContent } from '@google/gemini-cli-core';
import type { CommandContext } from '../ui/commands/types.js';

const mockPrompt = {
  name: 'test-image-prompt',
  description: 'A test prompt returning an image.',
  serverName: 'test-server',
  arguments: [],
  invoke: vi.fn(),
};

describe('McpPromptLoader Issue 15851', () => {
  const mockConfigWithPrompts = {
    getMcpClientManager: () => ({
      getMcpServers: () => ({
        'test-server': { httpUrl: 'https://test-server.com' },
      }),
    }),
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(cliCore, 'getMCPServerPrompts').mockReturnValue([mockPrompt]);
  });

  it('should support prompt returning image content', async () => {
    mockPrompt.invoke.mockResolvedValue({
      messages: [
        {
          role: 'user',
          content: {
            type: 'image',
            data: 'base64data',
            mimeType: 'image/png',
          },
        },
      ],
    });

    const loader = new McpPromptLoader(mockConfigWithPrompts);
    const commands = await loader.loadCommands(new AbortController().signal);
    const action = commands[0].action!;
    const context = {} as CommandContext;

    const result = await action(context, 'test-image-prompt');

    expect(result).toEqual({
      type: 'submit_prompt',
      content: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: 'base64data',
          },
        },
      ],
    });
  });

  it('should support prompt returning resource content', async () => {
    mockPrompt.invoke.mockResolvedValue({
      messages: [
        {
          role: 'user',
          content: {
            type: 'resource',
            resource: {
              uri: 'file:///example.txt',
              text: 'example text',
              mimeType: 'text/plain',
            },
          },
        },
      ],
    });

    const loader = new McpPromptLoader(mockConfigWithPrompts);
    const commands = await loader.loadCommands(new AbortController().signal);
    const action = commands[0].action!;
    const context = {} as CommandContext;

    const result = await action(context, 'test-image-prompt');

    expect(result).toEqual({
      type: 'submit_prompt',
      content: [{ text: sanitizeMcpContent('example text') }],
    });
  });
});
