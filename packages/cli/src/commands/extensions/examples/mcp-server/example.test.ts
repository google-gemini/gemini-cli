/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Mock the MCP server and transport
const mockRegisterTool = vi.fn();
const mockRegisterPrompt = vi.fn();
const mockConnect = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    registerTool: mockRegisterTool,
    registerPrompt: mockRegisterPrompt,
    connect: mockConnect,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

describe('MCP Server Example', () => {
  beforeEach(async () => {
    // Dynamically import the server setup after mocks are in place
    await import('./example.js');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should create an McpServer with the correct name and version', () => {
    expect(McpServer).toHaveBeenCalledWith({
      name: 'prompt-server',
      version: '1.0.0',
    });
  });

  it('should register the "fetch_posts" tool', () => {
    expect(mockRegisterTool).toHaveBeenCalledWith(
      'fetch_posts',
      {
        description: 'Fetches a list of posts from a public API.',
        inputSchema: z.object({}).shape,
      },
      expect.any(Function),
    );
  });

  it('should register the "poem-writer" prompt', () => {
    expect(mockRegisterPrompt).toHaveBeenCalledWith(
      'poem-writer',
      {
        title: 'Poem Writer',
        description: 'Write a nice haiku',
        argsSchema: expect.any(Object),
      },
      expect.any(Function),
    );
  });

  it('should connect the server to an StdioServerTransport', () => {
    expect(StdioServerTransport).toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalledWith(expect.any(StdioServerTransport));
  });

  describe('fetch_posts tool implementation', () => {
    it('should fetch posts and return a formatted response', async () => {
      const mockPosts = [
        { id: 1, title: 'Post 1' },
        { id: 2, title: 'Post 2' },
      ];
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockPosts),
      });

      const toolFn = (mockRegisterTool as Mock).mock.calls[0][2];
      const result = await toolFn();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://jsonplaceholder.typicode.com/posts',
      );
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ posts: mockPosts }),
          },
        ],
      });
    });
  });

  describe('poem-writer prompt implementation', () => {
    it('should generate a prompt with a title', () => {
      const promptFn = (mockRegisterPrompt as Mock).mock.calls[0][2];
      const result = promptFn({ title: 'My Poem' });
      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Write a haiku called My Poem. Note that a haiku is 5 syllables followed by 7 syllables followed by 5 syllables ',
            },
          },
        ],
      });
    });

    it('should generate a prompt with a title and mood', () => {
      const promptFn = (mockRegisterPrompt as Mock).mock.calls[0][2];
      const result = promptFn({ title: 'My Poem', mood: 'sad' });
      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Write a haiku with the mood sad called My Poem. Note that a haiku is 5 syllables followed by 7 syllables followed by 5 syllables ',
            },
          },
        ],
      });
    });
  });
});
