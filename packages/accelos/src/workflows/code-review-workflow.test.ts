/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { codeReviewWorkflow } from './code-review-workflow.js';

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

describe('Code Review Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('should have correct workflow configuration', () => {
    expect(codeReviewWorkflow.id).toBe('code-review-workflow');
    expect(codeReviewWorkflow.description).toContain('Comprehensive automated code review');
  });

  it('should validate input schema correctly', () => {
    const validInput = {
      codeContent: 'function test() { return true; }',
      filePath: 'test.js',
      language: 'javascript',
      reviewType: 'full' as const,
      includeDocumentation: true,
    };

    const result = codeReviewWorkflow.inputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject invalid input schema', () => {
    const invalidInput = {
      codeContent: '', // Empty code should fail
      reviewType: 'invalid-type', // Invalid review type
    };

    const result = codeReviewWorkflow.inputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should validate output schema correctly', () => {
    const validOutput = {
      summary: {
        overallScore: 8,
        issuesFound: 3,
        recommendations: 5,
        language: 'javascript',
      },
      analysis: {
        codeQuality: {
          score: 7,
          issues: ['Missing error handling'],
          strengths: ['Clean structure'],
        },
        securityFindings: [{
          severity: 'medium' as const,
          issue: 'Input validation missing',
          recommendation: 'Add input validation',
        }],
        performanceIssues: [{
          type: 'Algorithm',
          description: 'Inefficient loop',
          impact: 'low' as const,
          suggestion: 'Use more efficient algorithm',
        }],
      },
      recommendations: [{
        category: 'code-quality' as const,
        priority: 'high' as const,
        description: 'Improve error handling',
      }],
    };

    const result = codeReviewWorkflow.outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it('should handle full code review workflow execution', async () => {
    const { claudeCodeTool } = await import('../tools/claude-code.js');
    const mockExecute = vi.mocked(claudeCodeTool.execute);

    // Mock responses for different workflow steps
    mockExecute
      .mockResolvedValueOnce({
        // Code analysis step
        result: `The code shows good structure with clean variable names. 
                Issues found include potential performance problems with nested loops.
                Well-documented functions with clear purposes.`,
        metadata: {
          turnsUsed: 5,
          toolsCalled: ['read', 'grep'],
          hasErrors: false,
          executionTime: 3000,
        },
      })
      .mockResolvedValueOnce({
        // Security audit step
        result: `Security analysis reveals SQL injection vulnerability in the getUserData function.
                Critical: Direct string concatenation in SQL query.
                Medium: Missing input validation on user parameters.`,
        metadata: {
          turnsUsed: 8,
          toolsCalled: ['read', 'web_search'],
          hasErrors: false,
          executionTime: 5000,
        },
      })
      .mockResolvedValueOnce({
        // Performance review step
        result: `Performance analysis shows high impact algorithm complexity.
                O(n²) complexity detected in findDuplicates function.
                Memory usage concerns with large cache object allocation.`,
        metadata: {
          turnsUsed: 6,
          toolsCalled: ['read'],
          hasErrors: false,
          executionTime: 4000,
        },
      })
      .mockResolvedValueOnce({
        // Enhancement suggestions step
        result: `High priority recommendations:
                1. Fix SQL injection by using parameterized queries
                2. Optimize algorithm complexity for better performance
                3. Add proper error handling throughout the code
                Refactoring plan: Start with security issues, then performance.`,
        metadata: {
          turnsUsed: 10,
          toolsCalled: ['read', 'write', 'web_search'],
          hasErrors: false,
          executionTime: 6000,
        },
      })
      .mockResolvedValueOnce({
        // Documentation generation step
        result: `## Code Documentation
                
                ### getUserData Function
                Retrieves user data from the database based on user ID.
                
                **Parameters:**
                - userId: The unique identifier for the user
                
                **Returns:**
                - User object with user details
                
                ### Usage Example
                \`\`\`javascript
                const user = getUserData(123);
                console.log(user.name);
                \`\`\``,
        metadata: {
          turnsUsed: 4,
          toolsCalled: ['write'],
          hasErrors: false,
          executionTime: 2000,
        },
      });

    const run = await codeReviewWorkflow.createRunAsync();
    const result = await run.start({
      inputData: {
        codeContent: 'function test() { return true; }',
        filePath: 'test.js',
        language: 'javascript',
        reviewType: 'full',
        includeDocumentation: true,
      },
    });

    expect(result.status).toBe('success');
    expect(result.result).toBeDefined();
    expect(result.result.summary.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.result.summary.overallScore).toBeLessThanOrEqual(10);
    expect(result.result.analysis.codeQuality).toBeDefined();
    expect(result.result.analysis.securityFindings).toBeInstanceOf(Array);
    expect(result.result.analysis.performanceIssues).toBeInstanceOf(Array);
    expect(result.result.recommendations).toBeInstanceOf(Array);

    // Verify Claude Code tool was called for each step
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('should handle security-focused review type', async () => {
    const { claudeCodeTool } = await import('../tools/claude-code.js');
    const mockExecute = vi.mocked(claudeCodeTool.execute);

    mockExecute
      .mockResolvedValueOnce({
        result: 'Code analysis completed with good quality score.',
        metadata: { turnsUsed: 3, toolsCalled: [], hasErrors: false, executionTime: 1000 },
      })
      .mockResolvedValueOnce({
        result: 'Critical security vulnerabilities found including SQL injection.',
        metadata: { turnsUsed: 5, toolsCalled: ['web_search'], hasErrors: false, executionTime: 2000 },
      })
      .mockResolvedValueOnce({
        result: 'Performance analysis shows no major issues.',
        metadata: { turnsUsed: 2, toolsCalled: [], hasErrors: false, executionTime: 1000 },
      })
      .mockResolvedValueOnce({
        result: 'High priority security fixes recommended.',
        metadata: { turnsUsed: 4, toolsCalled: [], hasErrors: false, executionTime: 1500 },
      })
      .mockResolvedValueOnce({
        result: 'Documentation skipped for security review.',
        metadata: { turnsUsed: 1, toolsCalled: [], hasErrors: false, executionTime: 500 },
      });

    const run = await codeReviewWorkflow.createRunAsync();
    const result = await run.start({
      inputData: {
        codeContent: 'const query = "SELECT * FROM users WHERE id = " + userId;',
        reviewType: 'security',
        includeDocumentation: false,
      },
    });

    expect(result.status).toBe('success');
    expect(result.result.analysis.securityFindings).toBeDefined();
  });

  it('should handle performance-focused review type', async () => {
    const { claudeCodeTool } = await import('../tools/claude-code.js');
    const mockExecute = vi.mocked(claudeCodeTool.execute);

    mockExecute.mockResolvedValue({
      result: 'Performance issues detected with O(n²) complexity.',
      metadata: { turnsUsed: 4, toolsCalled: [], hasErrors: false, executionTime: 2000 },
    });

    const run = await codeReviewWorkflow.createRunAsync();
    const result = await run.start({
      inputData: {
        codeContent: 'for(let i=0;i<n;i++) { for(let j=0;j<n;j++) { /* O(n²) */ } }',
        reviewType: 'performance',
        includeDocumentation: false,
      },
    });

    expect(result.status).toBe('success');
    expect(result.result.analysis.performanceIssues).toBeDefined();
  });

  it('should handle workflow execution with Claude Code errors', async () => {
    const { claudeCodeTool } = await import('../tools/claude-code.js');
    const mockExecute = vi.mocked(claudeCodeTool.execute);

    // Mock Claude Code tool to throw an error
    mockExecute.mockRejectedValue(new Error('Claude Code API error'));

    const run = await codeReviewWorkflow.createRunAsync();
    const result = await run.start({
      inputData: {
        codeContent: 'function test() {}',
        reviewType: 'full' as const,
        includeDocumentation: true,
      },
    });

    // The workflow should handle errors gracefully
    expect(result.status).toBe('failed');
  });

  it('should handle missing ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const { claudeCodeTool } = await import('../tools/claude-code.js');
    const mockExecute = vi.mocked(claudeCodeTool.execute);

    mockExecute.mockResolvedValue({
      result: 'Error executing Claude Code: Authentication failed',
      metadata: { turnsUsed: 0, toolsCalled: [], hasErrors: true, executionTime: 100 },
    });

    const run = await codeReviewWorkflow.createRunAsync();
    const result = await run.start({
      inputData: {
        codeContent: 'function test() {}',
        reviewType: 'full' as const,
        includeDocumentation: true,
      },
    });

    expect(mockExecute).toHaveBeenCalled();
  });

  it('should handle different programming languages', async () => {
    const { claudeCodeTool } = await import('../tools/claude-code.js');
    const mockExecute = vi.mocked(claudeCodeTool.execute);

    mockExecute.mockResolvedValue({
      result: 'Python code analysis completed successfully.',
      metadata: { turnsUsed: 3, toolsCalled: [], hasErrors: false, executionTime: 2000 },
    });

    const run = await codeReviewWorkflow.createRunAsync();
    const result = await run.start({
      inputData: {
        codeContent: 'def hello(): return "world"',
        language: 'python',
        reviewType: 'full' as const,
        includeDocumentation: true,
      },
    });

    expect(result.status).toBe('success');
    
    // Verify that the language was passed to Claude Code
    const firstCall = mockExecute.mock.calls[0];
    expect(firstCall[0].context.prompt).toContain('python');
  });

  it('should validate step inputs and outputs', () => {
    // Test input schemas for individual steps are properly defined
    expect(codeReviewWorkflow.inputSchema).toBeDefined();
    expect(codeReviewWorkflow.outputSchema).toBeDefined();
    
    // Validate schema structure
    const inputParsed = codeReviewWorkflow.inputSchema.safeParse({
      codeContent: 'test code',
      reviewType: 'full',
    });
    expect(inputParsed.success).toBe(true);
  });

  it('should handle parallel step execution', async () => {
    const { claudeCodeTool } = await import('../tools/claude-code.js');
    const mockExecute = vi.mocked(claudeCodeTool.execute);

    let callOrder: string[] = [];
    
    mockExecute.mockImplementation(async ({ context }) => {
      const prompt = context.prompt as string;
      
      if (prompt.includes('security audit')) {
        callOrder.push('security');
      } else if (prompt.includes('performance')) {
        callOrder.push('performance');
      } else {
        callOrder.push('other');
      }
      
      return {
        result: 'Analysis completed',
        metadata: { turnsUsed: 2, toolsCalled: [], hasErrors: false, executionTime: 1000 },
      };
    });

    const run = await codeReviewWorkflow.createRunAsync();
    await run.start({
      inputData: {
        codeContent: 'function test() {}',
        reviewType: 'full' as const,
        includeDocumentation: true,
      },
    });

    // Verify that security and performance steps can run in parallel
    expect(callOrder).toContain('security');
    expect(callOrder).toContain('performance');
  });
});