/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getContextBreakdown } from './contextInfoService.js';
import type { Config, GeminiClient } from '@google/gemini-cli-core';

// Mock the core imports
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    tokenLimit: vi.fn((model: string) => {
      if (model.includes('flash')) return 1000000;
      return 2000000;
    }),
    getCoreSystemPrompt: vi.fn(
      () => 'You are a helpful AI assistant with access to tools.',
    ),
  };
});

describe('getContextBreakdown', () => {
  let mockConfig: Config;
  let mockGeminiClient: GeminiClient;
  let mockChat: {
    getLastPromptTokenCount: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockChat = {
      getLastPromptTokenCount: vi.fn().mockReturnValue(5000),
    };

    mockGeminiClient = {
      getChat: vi.fn().mockReturnValue(mockChat),
      getHistory: vi.fn().mockReturnValue([
        {
          role: 'user',
          parts: [{ text: 'Hello, how can you help me?' }],
        },
        {
          role: 'model',
          parts: [{ text: 'I can help you with many tasks!' }],
        },
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    mockConfig = {
      getModel: vi.fn().mockReturnValue('gemini-2.5-pro'),
      getToolRegistry: vi.fn().mockReturnValue({
        getFunctionDeclarations: vi.fn().mockReturnValue([
          {
            name: 'read_file',
            description: 'Reads a file from the filesystem',
            parameters: {},
          },
          {
            name: 'mcp__ide__getDiagnostics',
            description: 'Gets IDE diagnostics',
            parameters: {},
          },
          {
            name: 'mcp__ide__executeCode',
            description: 'Executes code',
            parameters: {},
          },
        ]),
      }),
      getUserMemory: vi.fn().mockReturnValue('Remember to be helpful.'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  });

  it('should return null when config is null', async () => {
    const result = await getContextBreakdown(null, mockGeminiClient);
    expect(result).toBeNull();
  });

  it('should return null when geminiClient is undefined', async () => {
    const result = await getContextBreakdown(mockConfig, undefined);
    expect(result).toBeNull();
  });

  it('should return context breakdown with all components', async () => {
    const result = await getContextBreakdown(mockConfig, mockGeminiClient);

    expect(result).toBeDefined();
    expect(result?.model).toBe('gemini-2.5-pro');
    expect(result?.currentTokens).toBe(5000);
    expect(result?.maxTokens).toBe(2000000);
    expect(result?.systemPromptTokens).toBeGreaterThan(0);
    expect(result?.toolsTokens).toBeGreaterThan(0);
    expect(result?.mcpToolsTokens).toBeGreaterThan(0);
    expect(result?.messagesTokens).toBeGreaterThan(0);
  });

  it('should separate MCP tools from system tools', async () => {
    const result = await getContextBreakdown(mockConfig, mockGeminiClient);

    expect(result?.mcpTools).toHaveLength(2);
    expect(result?.mcpTools[0].name).toBe('mcp__ide__executeCode');
    expect(result?.mcpTools[0].server).toBe('ide');
    expect(result?.mcpTools[0].tokens).toBeGreaterThan(0);

    expect(result?.mcpTools[1].name).toBe('mcp__ide__getDiagnostics');
    expect(result?.mcpTools[1].server).toBe('ide');
    expect(result?.mcpTools[1].tokens).toBeGreaterThan(0);
  });

  it('should sort MCP tools by server and name', async () => {
    const mockConfigWithMultipleServers = {
      ...mockConfig,
      getToolRegistry: vi.fn().mockReturnValue({
        getFunctionDeclarations: vi.fn().mockReturnValue([
          {
            name: 'mcp__zebra__tool',
            description: 'Tool from zebra server',
            parameters: {},
          },
          {
            name: 'mcp__alpha__tool',
            description: 'Tool from alpha server',
            parameters: {},
          },
        ]),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await getContextBreakdown(
      mockConfigWithMultipleServers,
      mockGeminiClient,
    );

    expect(result?.mcpTools[0].server).toBe('alpha');
    expect(result?.mcpTools[1].server).toBe('zebra');
  });

  it('should skip tools without a name', async () => {
    const mockConfigWithInvalidTools = {
      ...mockConfig,
      getToolRegistry: vi.fn().mockReturnValue({
        getFunctionDeclarations: vi.fn().mockReturnValue([
          {
            name: 'valid_tool',
            description: 'Valid tool',
            parameters: {},
          },
          {
            description: 'Invalid tool without name',
            parameters: {},
          },
        ]),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await getContextBreakdown(
      mockConfigWithInvalidTools,
      mockGeminiClient,
    );

    // Should not throw error and should process only the valid tool
    expect(result).toBeDefined();
    expect(result?.toolsTokens).toBeGreaterThan(0);
  });

  it('should estimate message tokens from history', async () => {
    const result = await getContextBreakdown(mockConfig, mockGeminiClient);

    // Messages should have some tokens based on the mocked history
    expect(result?.messagesTokens).toBeGreaterThan(0);
  });

  it('should estimate system prompt tokens including user memory', async () => {
    const result = await getContextBreakdown(mockConfig, mockGeminiClient);

    expect(result?.systemPromptTokens).toBeGreaterThan(0);
    // System prompt should be larger than just the memory
    expect(result?.systemPromptTokens).toBeGreaterThan(
      result?.memoryTokens || 0,
    );
  });

  it('should handle errors gracefully', async () => {
    const errorConfig = {
      ...mockConfig,
      getModel: vi.fn().mockImplementation(() => {
        throw new Error('Failed to get model');
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await getContextBreakdown(errorConfig, mockGeminiClient);

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should return empty arrays for MCP tools and memory files when none exist', async () => {
    const mockConfigWithoutMcp = {
      ...mockConfig,
      getToolRegistry: vi.fn().mockReturnValue({
        getFunctionDeclarations: vi.fn().mockReturnValue([
          {
            name: 'read_file',
            description: 'Reads a file',
            parameters: {},
          },
        ]),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await getContextBreakdown(
      mockConfigWithoutMcp,
      mockGeminiClient,
    );

    expect(result?.mcpTools).toHaveLength(0);
    expect(result?.mcpToolsTokens).toBe(0);
    expect(result?.memoryFiles).toHaveLength(0);
  });
});
