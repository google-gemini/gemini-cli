/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { simpleCodeReviewWorkflow } from './simple-code-review-workflow.js';

// Mock the Claude Code tool
vi.mock('../tools/claude-code.js', async () => {
  const actual = await vi.importActual('../tools/claude-code.js');
  return {
    ...actual,
    claudeCodeTool: {
      execute: vi.fn(),
      id: 'claude-code',
      description: 'Mock Claude Code tool',
    },
  };
});

describe('Simple Code Review Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('should have correct workflow configuration', () => {
    expect(simpleCodeReviewWorkflow.id).toBe('simple-code-review-workflow');
    expect(simpleCodeReviewWorkflow.description).toContain('Simplified comprehensive code review');
  });

  it('should validate input schema correctly', () => {
    const validInput = {
      codeContent: 'function test() { return true; }',
      filePath: 'test.js',
      language: 'javascript',
      reviewType: 'full' as const,
      includeDocumentation: true,
    };

    const result = simpleCodeReviewWorkflow.inputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject invalid input schema', () => {
    const invalidInput = {
      codeContent: '', // Empty code should fail
      reviewType: 'invalid-type', // Invalid review type
    };

    const result = simpleCodeReviewWorkflow.inputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should execute workflow successfully with mock', async () => {
    const { claudeCodeTool } = await import('../tools/claude-code.js');
    const mockExecute = vi.mocked(claudeCodeTool.execute);

    mockExecute.mockResolvedValue({
      result: `Code Quality Assessment (8/10):
      This is well-structured JavaScript code with good readability.
      
      Security Analysis:
      No critical security vulnerabilities found. The code follows basic security practices.
      
      Performance Review:
      Code shows good performance characteristics. No major bottlenecks detected.
      
      Recommendations:
      - Consider adding more comprehensive error handling
      - Add unit tests for better maintainability
      `,
      metadata: {
        turnsUsed: 8,
        toolsCalled: ['read', 'web_search'],
        hasErrors: false,
        executionTime: 4000,
      },
    });

    const run = await simpleCodeReviewWorkflow.createRunAsync();
    const result = await run.start({
      inputData: {
        codeContent: 'function getUserData() { return "test"; }',
        filePath: 'test.js',
        language: 'javascript',
        reviewType: 'full' as const,
        includeDocumentation: true,
      },
    });

    expect(result.status).toBe('success');
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          prompt: expect.stringContaining('comprehensive code review'),
          options: expect.objectContaining({
            customSystemPrompt: expect.stringContaining('expert code reviewer'),
            maxTurns: 25,
          }),
        }),
        runtimeContext: expect.any(Object),
      })
    );
  });

  it('should handle different review types', async () => {
    const { claudeCodeTool } = await import('../tools/claude-code.js');
    const mockExecute = vi.mocked(claudeCodeTool.execute);

    mockExecute.mockResolvedValue({
      result: 'Security-focused analysis completed successfully.',
      metadata: { turnsUsed: 3, toolsCalled: ['web_search'], hasErrors: false, executionTime: 2000 },
    });

    const run = await simpleCodeReviewWorkflow.createRunAsync();
    const result = await run.start({
      inputData: {
        codeContent: 'const query = "SELECT * FROM users";',
        reviewType: 'security' as const,
        includeDocumentation: false,
      },
    });

    expect(result.status).toBe('success');
    
    // Verify the prompt includes security focus
    const firstCall = mockExecute.mock.calls[0];
    expect(firstCall[0].context.prompt).toContain('security');
  });

  it('should handle errors gracefully', async () => {
    const { claudeCodeTool } = await import('../tools/claude-code.js');
    const mockExecute = vi.mocked(claudeCodeTool.execute);

    mockExecute.mockRejectedValue(new Error('Claude Code API error'));

    const run = await simpleCodeReviewWorkflow.createRunAsync();
    const result = await run.start({
      inputData: {
        codeContent: 'function test() {}',
        reviewType: 'full' as const,
        includeDocumentation: false,
      },
    });

    expect(result.status).toBe('failed');
  });
});