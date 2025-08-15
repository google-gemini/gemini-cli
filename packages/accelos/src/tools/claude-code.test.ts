/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { claudeCodeTool } from './claude-code.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Claude Code SDK
vi.mock('@anthropic-ai/claude-code', () => ({
  query: vi.fn(),
}));

describe('Claude Code Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up environment variable for tests
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('should have correct tool configuration', () => {
    expect(claudeCodeTool.id).toBe('claude-code');
    expect(claudeCodeTool.description).toContain('Claude Code\'s advanced coding capabilities');
  });

  it('should validate input schema correctly', () => {
    const validInput = {
      prompt: 'Test prompt',
      options: {
        mode: 'basic',
        customSystemPrompt: 'Test system prompt',
        maxTurns: 10,
      },
    };

    const result = claudeCodeTool.inputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should validate input schema with cwd parameter', () => {
    const validInputWithCwd = {
      prompt: 'Test prompt',
      options: {
        mode: 'streaming',
        cwd: '/custom/working/directory',
        customSystemPrompt: 'Test system prompt',
        maxTurns: 10,
      },
    };

    const result = claudeCodeTool.inputSchema.safeParse(validInputWithCwd);
    expect(result.success).toBe(true);
  });

  it('should reject invalid input', () => {
    const invalidInput = {
      prompt: '', // Empty prompt should fail
      options: {
        mode: 'basic',
      },
    };

    const result = claudeCodeTool.inputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should validate output schema correctly', () => {
    const validOutput = {
      result: 'Test result',
      metadata: {
        mode: 'basic',
        turnsUsed: 5,
        toolsCalled: ['bash', 'read'],
        sessionId: 'test-session-id',
        hasErrors: false,
        executionTime: 1000,
      },
    };

    const result = claudeCodeTool.outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it('should throw error when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await claudeCodeTool.execute({
      context: {
        prompt: 'Test prompt',
        options: {
          mode: 'basic',
        },
      },
    });

    expect(result.result).toContain('ANTHROPIC_API_KEY environment variable is required');
    expect(result.metadata.hasErrors).toBe(true);
  });

  it('should handle basic execution flow', async () => {
    const { query } = await import('@anthropic-ai/claude-code');
    const mockQuery = vi.mocked(query);
    
    // Mock the async generator
    const mockMessages = [
      {
        type: 'system' as const,
        subtype: 'init' as const,
        session_id: 'test-session',
        tools: ['bash', 'read'],
        apiKeySource: 'user' as const,
        cwd: '/test',
        mcp_servers: [],
        model: 'claude-3-5-sonnet-20241022',
        permissionMode: 'default' as const,
        slash_commands: [],
      },
      {
        type: 'result' as const,
        subtype: 'success' as const,
        result: 'Test result',
        num_turns: 3,
        session_id: 'test-session',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
        },
        permission_denials: [],
      },
    ];

    mockQuery.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        for (const message of mockMessages) {
          yield message;
        }
      },
      interrupt: vi.fn(),
    } as unknown);

    const result = await claudeCodeTool.execute({
      context: {
        prompt: 'Test prompt',
        options: {
          mode: 'basic',
          maxTurns: 5,
          debug: false,
        },
      },
    });

    expect(result.result).toBe('Test result');
    expect(result.metadata.turnsUsed).toBe(3);
    expect(result.metadata.sessionId).toBe('test-session');
    expect(result.metadata.hasErrors).toBe(false);
    expect(result.metadata.toolsCalled).toEqual(['bash', 'read']);
  });

  it('should handle error results', async () => {
    const { query } = await import('@anthropic-ai/claude-code');
    const mockQuery = vi.mocked(query);
    
    const mockMessages = [
      {
        type: 'result' as const,
        subtype: 'error_max_turns' as const,
        num_turns: 10,
        session_id: 'test-session',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
        },
        permission_denials: [],
      },
    ];

    mockQuery.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        for (const message of mockMessages) {
          yield message;
        }
      },
      interrupt: vi.fn(),
    } as unknown);

    const result = await claudeCodeTool.execute({
      context: {
        prompt: 'Test prompt that will hit max turns',
        options: {
          mode: 'basic',
        },
      },
    });

    expect(result.result).toBe('Execution failed: error_max_turns');
    expect(result.metadata.hasErrors).toBe(true);
    expect(result.metadata.turnsUsed).toBe(10);
  });

  it('should handle SDK errors gracefully', async () => {
    const { query } = await import('@anthropic-ai/claude-code');
    const mockQuery = vi.mocked(query);
    
    mockQuery.mockImplementation(() => {
      throw new Error('API rate limit exceeded');
    });

    await expect(
      claudeCodeTool.execute({
        context: {
          prompt: 'Test prompt',
          options: {
            mode: 'basic',
          },
        },
      })
    ).rejects.toThrow('Rate limit or quota exceeded');
  });

  it('should handle general SDK errors in result', async () => {
    const { query } = await import('@anthropic-ai/claude-code');
    const mockQuery = vi.mocked(query);
    
    mockQuery.mockImplementation(() => {
      throw new Error('Network connection failed');
    });

    const result = await claudeCodeTool.execute({
      context: {
        prompt: 'Test prompt',
        options: {
          mode: 'basic',
        },
      },
    });

    expect(result.result).toContain('Error executing Claude Code');
    expect(result.metadata.hasErrors).toBe(true);
    expect(result.metadata.executionTime).toBeGreaterThanOrEqual(0);
  });

  it('should use REPOSITORY_PATH as default cwd when no cwd provided', async () => {
    const { query } = await import('@anthropic-ai/claude-code');
    const mockQuery = vi.mocked(query);
    
    // Set REPOSITORY_PATH for the test
    const originalRepoPath = process.env.REPOSITORY_PATH;
    process.env.REPOSITORY_PATH = '/test/repo/path';
    
    let capturedOptions: any;
    mockQuery.mockImplementation((params) => {
      capturedOptions = params.options;
      return {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'result' as const,
            subtype: 'success' as const,
            result: 'Test result',
            num_turns: 1,
            session_id: 'test-session',
            duration_ms: 1000,
            duration_api_ms: 800,
            is_error: false,
            total_cost_usd: 0.01,
            usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: null, cache_read_input_tokens: null },
            permission_denials: [],
          };
        }
      } as unknown;
    });

    await claudeCodeTool.execute({
      context: {
        prompt: 'Test prompt',
        options: {
          mode: 'basic',
        },
      },
    });

    expect(capturedOptions.cwd).toBe('/test/repo/path');
    
    // Restore original value
    if (originalRepoPath) {
      process.env.REPOSITORY_PATH = originalRepoPath;
    } else {
      delete process.env.REPOSITORY_PATH;
    }
  });

  it('should use provided cwd over REPOSITORY_PATH', async () => {
    const { query } = await import('@anthropic-ai/claude-code');
    const mockQuery = vi.mocked(query);
    
    // Set REPOSITORY_PATH for the test
    const originalRepoPath = process.env.REPOSITORY_PATH;
    process.env.REPOSITORY_PATH = '/default/repo/path';
    
    let capturedOptions: any;
    mockQuery.mockImplementation((params) => {
      capturedOptions = params.options;
      return {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'result' as const,
            subtype: 'success' as const,
            result: 'Test result',
            num_turns: 1,
            session_id: 'test-session',
            duration_ms: 1000,
            duration_api_ms: 800,
            is_error: false,
            total_cost_usd: 0.01,
            usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: null, cache_read_input_tokens: null },
            permission_denials: [],
          };
        }
      } as unknown;
    });

    await claudeCodeTool.execute({
      context: {
        prompt: 'Test prompt',
        options: {
          mode: 'basic',
          cwd: '/custom/working/directory',
        },
      },
    });

    expect(capturedOptions.cwd).toBe('/custom/working/directory');
    
    // Restore original value
    if (originalRepoPath) {
      process.env.REPOSITORY_PATH = originalRepoPath;
    } else {
      delete process.env.REPOSITORY_PATH;
    }
  });
});