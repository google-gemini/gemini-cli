/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { GenerateCommitMessageTool } from './generate-commit-message.js';
import { Config, ApprovalMode } from '../config/config.js';
import { spawn } from 'child_process';
import { GeminiClient } from '../core/client.js';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}));

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    generateContent: vi.fn(),
    getContentGenerator: vi.fn(() => ({
      countTokens: vi.fn().mockResolvedValue({ totalTokens: 100 }),
    })),
  })),
}));

// Helper function to create git command mock
function createGitCommandMock(outputs: { [key: string]: string }) {
  return (_command: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: { on: ReturnType<typeof vi.fn> };
      stderr: { on: ReturnType<typeof vi.fn> };
      stdin?: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; once: ReturnType<typeof vi.fn> };
    };

    const argString = args.join(' ');
    if (_command === 'git' && argString.includes('commit')) {
      child.stdin = {
        write: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
      };
    }

    child.stdout = {
      on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        if (event === 'data') {
          for (const [pattern, output] of Object.entries(outputs)) {
            if (argString.includes(pattern)) {
              listener(Buffer.from(output));
              break;
            }
          }
        }
      }),
    };

    child.stderr = { on: vi.fn() };
    process.nextTick(() => child.emit('close', 0));
    return child;
  };
}

describe('GenerateCommitMessageTool', () => {
  let tool: GenerateCommitMessageTool;
  let mockConfig: Config;
  let mockClient: GeminiClient;
  let mockSpawn: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = new GeminiClient({} as unknown as Config);
    mockConfig = {
      getGeminiClient: () => mockClient,
      getApprovalMode: () => ApprovalMode.DEFAULT,
      setApprovalMode: vi.fn(),
      getModel: () => 'gemini-1.5-flash',
    } as unknown as Config;
    tool = new GenerateCommitMessageTool(mockConfig);
    mockSpawn = spawn as Mock;
    (mockClient.generateContent as Mock).mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  analysis: {
                    changedFiles: ['file.txt'],
                    changeType: 'feat',
                    scope: '',
                    purpose: 'Add new feature',
                    impact: 'Improves functionality',
                    hasSensitiveInfo: false,
                  },
                  commitMessage: {
                    header: 'feat: new feature',
                    body: '',
                    footer: '',
                  },
                }),
              },
            ],
          },
        },
      ],
    });
  });

  it('should return a message when there are no changes', async () => {
    mockSpawn.mockImplementation(createGitCommandMock({
      'status': '',
      'diff --cached': '',
      'diff': '',
      'log': 'abc1234 Previous commit'
    }));

    const result = await tool.execute(undefined, new AbortController().signal);

    expect(result.llmContent).toBe(
      'No changes detected in the current workspace.',
    );
    expect(result.returnDisplay).toBe(
      'No changes detected in the current workspace.',
    );
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });

  it('should return an error when git command fails', async () => {
    mockSpawn.mockImplementation((_command, _args) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: { on: ReturnType<typeof vi.fn> };
        stderr: { on: ReturnType<typeof vi.fn> };
      };
      child.stdout = { on: vi.fn() };
      child.stderr = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        if (event === 'data') listener(Buffer.from('git error'));
      }) };
      process.nextTick(() => child.emit('close', 1));
      return child;
    });

    const result = await tool.execute(undefined, new AbortController().signal);

    expect(result.llmContent).toContain('Error during commit workflow');
    expect(result.returnDisplay).toContain('Error during commit workflow');
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });

  it('should generate a commit message and create commit when there are staged changes', async () => {
    const diff =
      'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
    const statusOutput = 'M  file.txt';
    const logOutput = 'abc1234 Previous commit message';

    mockSpawn.mockImplementation((command: string, args: string[]) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: { on: ReturnType<typeof vi.fn> };
        stderr: { on: ReturnType<typeof vi.fn> };
        stdin?: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; once: ReturnType<typeof vi.fn> };
      };
      const argString = args.join(' ');

      child.stdout = {
        on: vi.fn((event: string, listener: (data: Buffer) => void) => {
          if (event === 'data') {
            if (argString.includes('status'))
              listener(Buffer.from(statusOutput));
            else if (argString.includes('diff --cached'))
              listener(Buffer.from(diff));
            else if (argString.includes('diff') && !args.includes('--cached'))
              listener(Buffer.from(''));
            else if (argString.includes('log'))
              listener(Buffer.from(logOutput));
            else listener(Buffer.from(''));
          }
        }),
      };

      child.stderr = { on: vi.fn() };

      if (command === 'git' && argString === 'commit -F -') {
        child.stdin = {
          write: vi.fn(),
          end: vi.fn(),
          on: vi.fn(),
          once: vi.fn(),
        };
      }

      process.nextTick(() => child.emit('close', 0));
      return child;
    });

    const controller = new AbortController();
    const result = await tool.execute(undefined, controller.signal);

    expect(result.llmContent).toBe(
      'Commit created successfully!\n\nCommit message:\nfeat: new feature',
    );
    expect(result.returnDisplay).toBe(
      'Commit created successfully!\n\nCommit message:\nfeat: new feature',
    );
    expect(mockClient.generateContent).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          parts: [
            {
              text: expect.stringContaining(diff),
            },
          ],
        },
      ],
      {},
      controller.signal,
    );

    // Verify git commands were called in correct sequence
    expect(mockSpawn).toHaveBeenCalledWith(
      'git',
      ['status', '--porcelain'],
      expect.any(Object),
    );
    expect(mockSpawn).toHaveBeenCalledWith(
      'git',
      ['diff', '--cached'],
      expect.any(Object),
    );
    expect(mockSpawn).toHaveBeenCalledWith(
      'git',
      ['commit', '-F', '-'],
      expect.any(Object),
    );
  });

  it('should generate a commit message when there are only unstaged changes', async () => {
    const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
    const statusOutput = ' M file.txt';
    const logOutput = 'abc1234 Previous commit message';

    mockSpawn.mockImplementation(createGitCommandMock({
      'status': statusOutput,
      'diff --cached': '', // No staged changes
      diff,
      'log': logOutput,
      add: '',
      'commit': ''
    }));

    const controller = new AbortController();
    const result = await tool.execute(undefined, controller.signal);

    expect(result.llmContent).toBe('Commit created successfully!\n\nCommit message:\nfeat: new feature');
    expect(result.returnDisplay).toBe('Commit created successfully!\n\nCommit message:\nfeat: new feature');
    expect(mockClient.generateContent).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          parts: [
            {
              text: expect.stringContaining(diff),
            },
          ],
        },
      ],
      {},
      controller.signal,
    );
    
    // Verify staging command was called for unstaged changes
    expect(mockSpawn).toHaveBeenCalledWith('git', ['add', '.'], expect.any(Object));
  });

  it('should handle pre-commit hook modifications and retry', async () => {
    const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
    const statusOutput = 'M  file.txt';
    const logOutput = 'abc1234 Previous commit message';

    let commitCallCount = 0;
    mockSpawn.mockImplementation((_command, args) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: { on: ReturnType<typeof vi.fn> };
        stderr: { on: ReturnType<typeof vi.fn> };
        stdin?: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; once: ReturnType<typeof vi.fn> };
      };
      
      child.stdout = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        if (event === 'data') {
          const argString = args.join(' ');
          if (argString.includes('status')) {
            listener(Buffer.from(statusOutput));
          } else if (argString.includes('diff --cached')) {
            listener(Buffer.from(diff));
          } else if (argString.includes('diff') && !argString.includes('--cached')) {
            listener(Buffer.from(''));
          } else if (argString.includes('log')) {
            listener(Buffer.from(logOutput));
          } else {
            listener(Buffer.from('')); // Default for add and commit
          }
        }
      }) };
      
      child.stderr = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        if (event === 'data' && args.includes('commit') && commitCallCount === 0) {
          listener(Buffer.from('pre-commit hook failed'));
        }
      }) };

      if (args.includes('commit')) {
        child.stdin = {
          write: vi.fn(),
          end: vi.fn(),
          on: vi.fn(),
          once: vi.fn(),
        };
      }
      
      process.nextTick(() => {
        if (args.includes('commit')) {
          commitCallCount++;
          if (commitCallCount === 1) {
            child.emit('close', 1); // First commit fails
          } else {
            child.emit('close', 0); // Second commit succeeds
          }
        } else {
          child.emit('close', 0); // All other commands succeed
        }
      });
      
      return child;
    });

    const controller = new AbortController();
    const result = await tool.execute(undefined, controller.signal);

    expect(result.llmContent).toBe('Commit created successfully after pre-commit hook modifications!\n\nCommit message:\nfeat: new feature');
    expect(result.returnDisplay).toBe('Commit created successfully after pre-commit hook modifications!\n\nCommit message:\nfeat: new feature');
    
    // Verify retry staging was called
    expect(mockSpawn).toHaveBeenCalledWith('git', ['add', '.'], expect.any(Object));
    // Verify both commit attempts were made
    expect(commitCallCount).toBe(2);
  });

  it('should return an error when spawn process fails to start', async () => {
    const mockError = new Error('spawn error');
    mockSpawn.mockImplementationOnce(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: { on: ReturnType<typeof vi.fn> };
        stderr: { on: ReturnType<typeof vi.fn> };
      };
      child.stdout = { on: vi.fn() };
      child.stderr = { on: vi.fn() };
      process.nextTick(() => child.emit('error', mockError));
      return child;
    });

    const result = await tool.execute(undefined, new AbortController().signal);

    expect(result.llmContent).toContain('Error during commit workflow');
    expect(result.returnDisplay).toContain('Error during commit workflow');
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });

  it('should handle mixed staged and unstaged changes intelligently', async () => {
    const statusOutput = 'MM file.txt\n?? newfile.txt';
    const logOutput = 'abc1234 Previous commit message';

    mockSpawn.mockImplementation(createGitCommandMock({
      'status': statusOutput,
      'diff --cached': 'diff --git a/file.txt b/file.txt\n@@ -1 +1 @@\n-line2\n+line2 modified',
      'diff': 'diff --git a/file.txt b/file.txt\n@@ -2 +2 @@\n+line3 added',
      'log': logOutput,
      add: '',
      'commit': ''
    }));

    (mockClient.generateContent as Mock).mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  analysis: {
                    changedFiles: ['file.txt'],
                    changeType: 'feat',
                    scope: '',
                    purpose: 'Add staged changes',
                    impact: 'Improves functionality with staged changes',
                    hasSensitiveInfo: false,
                  },
                  commitMessage: {
                    header: 'feat: staged changes',
                    body: '',
                    footer: '',
                  },
                }),
              },
            ],
          },
        },
      ],
    });

    const controller = new AbortController();
    const result = await tool.execute(undefined, controller.signal);

    expect(result.llmContent).toBe('Commit created successfully!\n\nCommit message:\nfeat: staged changes');
    expect(result.returnDisplay).toBe('Commit created successfully!\n\nCommit message:\nfeat: staged changes');
    
    // With staged changes present, should NOT call git add (only commit staged changes)
    expect(mockSpawn).not.toHaveBeenCalledWith('git', ['add', '.'], expect.any(Object));
  });

  describe('JSON parsing', () => {
    it('should parse JSON from markdown code blocks', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
        'commit': ''
      }));

      const jsonResponse = {
        analysis: {
          changedFiles: ['file.txt'],
          changeType: 'feat' as const,
          scope: '',
          purpose: 'Update file content',
          impact: 'Improves file',
          hasSensitiveInfo: false,
        },
        commitMessage: {
          header: 'feat: update file content',
          body: '',
          footer: '',
        },
      };

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `Here's the analysis:\n\`\`\`json\n${JSON.stringify(jsonResponse, null, 2)}\n\`\`\`\n\nThis is a good commit.`,
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toBe('Commit created successfully!\n\nCommit message:\nfeat: update file content');
    });

    it('should parse JSON without markdown code blocks', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
        'commit': ''
      }));

      const jsonResponse = {
        analysis: {
          changedFiles: ['file.txt'],
          changeType: 'fix' as const,
          scope: '',
          purpose: 'Fix file issue',
          impact: 'Fixes bug',
          hasSensitiveInfo: false,
        },
        commitMessage: {
          header: 'fix: resolve file issue',
          body: '',
          footer: '',
        },
      };

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `Analysis: ${JSON.stringify(jsonResponse)} and some additional text after`,
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toBe('Commit created successfully!\n\nCommit message:\nfix: resolve file issue');
    });

    it('should handle multiple JSON objects and parse the first one', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
        'commit': ''
      }));

      const firstJsonResponse = {
        analysis: {
          changedFiles: ['file.txt'],
          changeType: 'docs' as const,
          scope: '',
          purpose: 'Update documentation',
          impact: 'Improves docs',
          hasSensitiveInfo: false,
        },
        commitMessage: {
          header: 'docs: update documentation',
          body: '',
          footer: '',
        },
      };

      const secondJsonResponse = {
        analysis: {
          changedFiles: ['other.txt'],
          changeType: 'feat' as const,
          scope: '',
          purpose: 'Should not be parsed',
          impact: 'Wrong one',
          hasSensitiveInfo: false,
        },
        commitMessage: {
          header: 'feat: should not be used',
          body: '',
          footer: '',
        },
      };

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `First: ${JSON.stringify(firstJsonResponse)} and second: ${JSON.stringify(secondJsonResponse)}`,
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toBe('Commit created successfully!\n\nCommit message:\ndocs: update documentation');
    });

    it('should handle invalid JSON gracefully', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'This is not JSON at all, just some text response without proper structure.',
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('AI response parsing failed');
    });

    it('should handle malformed JSON structure gracefully', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    analysis: {
                      changedFiles: 'should be array', // Invalid type
                      changeType: 'feat',
                      purpose: 'Test purpose',
                      impact: 'Test impact',
                      hasSensitiveInfo: false,
                    },
                    commitMessage: {
                      header: 'feat: test',
                    },
                  }),
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('AI response parsing failed');
    });

    it('should handle JSON with braces in string values', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
        'commit': ''
      }));

      const jsonResponse = {
        analysis: {
          changedFiles: ['file.txt'],
          changeType: 'feat' as const,
          scope: '',
          purpose: 'Add feature with {braces} in description',
          impact: 'Improves {functionality} with {special} characters',
          hasSensitiveInfo: false,
        },
        commitMessage: {
          header: 'feat: add feature with braces',
          body: 'This commit message contains {braces} in the body text',
          footer: '',
        },
      };

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `Some text before ${JSON.stringify(jsonResponse)} and text after with more {braces}`,
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toBe('Commit created successfully!\n\nCommit message:\nfeat: add feature with braces\n\nThis commit message contains {braces} in the body text');
    });

    it('should validate commit message header format', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    analysis: {
                      changedFiles: ['file.txt'],
                      changeType: 'feat',
                      purpose: 'Test purpose',
                      impact: 'Test impact',
                      hasSensitiveInfo: false,
                    },
                    commitMessage: {
                      header: 'invalid header format', // Invalid format
                    },
                  }),
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('conventional commits format');
    });

    it('should validate empty changedFiles array', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    analysis: {
                      changedFiles: [], // Empty array
                      changeType: 'feat',
                      purpose: 'Test purpose',
                      impact: 'Test impact',
                      hasSensitiveInfo: false,
                    },
                    commitMessage: {
                      header: 'feat: test',
                    },
                  }),
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('must contain at least one file');
    });

    it('should handle enhanced multiple JSON objects parsing - iterate through invalid ones to find valid', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';  
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
        'commit': ''
      }));

      // Create a response with multiple JSON objects - some invalid, one valid
      const invalidJson1 = '{"incomplete": "json"'; // Malformed - will be ignored by extractAllJsonObjects
      const invalidJson2 = JSON.stringify({
        analysis: { changedFiles: [] }, // Invalid - empty changedFiles
        commitMessage: { header: 'invalid' }
      });
      const validJson = JSON.stringify({
        analysis: {
          changedFiles: ['file.txt'],
          changeType: 'feat',
          purpose: 'Add new feature',
          impact: 'Improves functionality',
          hasSensitiveInfo: false,
        },
        commitMessage: {
          header: 'feat: add new feature',
          body: '',
          footer: '',
        },
      });

      // Need to create proper JSON objects that will be detected by the parser
      // Use complete JSON objects so they can be properly extracted
      const malformedButCompleteJson = '{"malformed": "structure", "missing": "required fields"}';
      
      // AI response with multiple JSON objects where the third one is valid
      const aiResponse = `Let me analyze this commit. Here are some possibilities:

First attempt: ${malformedButCompleteJson}

Actually, let me try again: ${invalidJson2}

Here's the correct analysis: ${validJson}

That should work better!`;

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: aiResponse }],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toBe('Commit created successfully!\n\nCommit message:\nfeat: add new feature');
    });

    it('should handle enhanced multiple JSON objects in code blocks - iterate through invalid ones to find valid', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';  
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
        'commit': ''
      }));

      // Create multiple code blocks with JSON - some invalid, one valid
      const invalidJson = JSON.stringify({
        analysis: { changedFiles: [] }, // Invalid - empty changedFiles
        commitMessage: { header: 'invalid' }
      });
      const validJson = JSON.stringify({
        analysis: {
          changedFiles: ['file.txt'],
          changeType: 'fix',
          purpose: 'Fix issue',
          impact: 'Resolves problem',
          hasSensitiveInfo: false,
        },
        commitMessage: {
          header: 'fix: resolve issue',
          body: '',
          footer: '',
        },
      });

      // AI response with multiple code blocks where the second one is valid
      const aiResponse = `Let me analyze this commit.

First attempt:
\`\`\`json
${invalidJson}
\`\`\`

That's not quite right. Let me try again:
\`\`\`json
${validJson}
\`\`\`

That should work better!`;

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: aiResponse }],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toBe('Commit created successfully!\n\nCommit message:\nfix: resolve issue');
    });
  });

  describe('Git index hash and race condition protection', () => {
    it('should complete commit workflow successfully', async () => {
      const statusOutput = 'M  file.txt';
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
        'commit': ''
      }));

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Commit created successfully!');
      expect(result.llmContent).toContain('feat: new feature');
    });
  });

  describe('Enhanced error handling', () => {
    it('should handle stdin write errors gracefully', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation((_command, args) => {
        const child = new EventEmitter() as EventEmitter & {
          stdout: { on: ReturnType<typeof vi.fn> };
          stderr: { on: ReturnType<typeof vi.fn> };
          stdin?: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; once: ReturnType<typeof vi.fn> };
        };
        
        child.stdout = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
          if (event === 'data') {
            const argString = args.join(' ');
            if (argString.includes('status')) {
              listener(Buffer.from(statusOutput));
            } else if (argString.includes('diff --cached')) {
              listener(Buffer.from(diff));
            } else if (argString.includes('diff') && !argString.includes('--cached')) {
              listener(Buffer.from(''));
            } else if (argString.includes('log')) {
              listener(Buffer.from(logOutput));
            } else {
              listener(Buffer.from(''));
            }
          }
        }) };
        
        child.stderr = { on: vi.fn() };
        
        if (args.includes('commit')) {
          child.stdin = {
            write: vi.fn(() => {
              throw new Error('EPIPE: broken pipe');
            }),
            end: vi.fn(),
            on: vi.fn(),
            once: vi.fn(),
          };
        }
        
        process.nextTick(() => child.emit('close', 0));
        return child;
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('Failed to write to git process stdin');
    });

    it('should handle stdin EPIPE errors with specific messages', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation((_command, args) => {
        const child = new EventEmitter() as EventEmitter & {
          stdout: { on: ReturnType<typeof vi.fn> };
          stderr: { on: ReturnType<typeof vi.fn> };
          stdin?: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; once: ReturnType<typeof vi.fn> };
        };
        
        child.stdout = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
          if (event === 'data') {
            const argString = args.join(' ');
            if (argString.includes('status')) {
              listener(Buffer.from(statusOutput));
            } else if (argString.includes('diff --cached')) {
              listener(Buffer.from(diff));
            } else if (argString.includes('diff') && !argString.includes('--cached')) {
              listener(Buffer.from(''));
            } else if (argString.includes('log')) {
              listener(Buffer.from(logOutput));
            } else {
              listener(Buffer.from(''));
            }
          }
        }) };
        
        child.stderr = { on: vi.fn() };
        
        if (args.includes('commit')) {
          child.stdin = {
            write: vi.fn(),
            end: vi.fn(),
            on: vi.fn((event: string, listener: (error: Error & { code?: string }) => void) => {
              if (event === 'error') {
                const error = new Error('broken pipe') as Error & { code?: string };
                error.code = 'EPIPE';
                listener(error);
              }
            }),
            once: vi.fn(),
          };
        }
        
        process.nextTick(() => child.emit('close', 0));
        return child;
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('Git process closed unexpectedly before commit message could be written');
    });

    it('should handle AI API errors with specific messages', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockRejectedValue(new Error('quota exceeded'));

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('API error during commit message generation');
    });

    it('should handle network errors with specific messages', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockRejectedValue(new Error('ENOTFOUND api.gemini.com'));

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('Network error during commit message generation');
      expect(result.llmContent).toContain('check your internet connection');
    });

    it('should handle authentication errors with specific messages', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockRejectedValue(new Error('401 Unauthorized'));

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('Authentication error during commit message generation');
      expect(result.llmContent).toContain('verify your API key');
    });

    it('should handle content policy errors with specific messages', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockRejectedValue(new Error('Content policy violation'));

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('Content policy error during commit message generation');
      expect(result.llmContent).toContain('safety filters');
    });

    it('should detect sensitive information in commits', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    analysis: {
                      changedFiles: ['file.txt'],
                      changeType: 'feat',
                      scope: '',
                      purpose: 'Add API key',
                      impact: 'Adds functionality',
                      hasSensitiveInfo: true, // Sensitive info detected
                    },
                    commitMessage: {
                      header: 'feat: add API integration',
                      body: '',
                      footer: '',
                    },
                  }),
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('potentially sensitive information');
    });

    it('should validate invalid changeType values', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    analysis: {
                      changedFiles: ['file.txt'],
                      changeType: 'invalid-type', // Invalid changeType
                      purpose: 'Test purpose',
                      impact: 'Test impact',
                      hasSensitiveInfo: false,
                    },
                    commitMessage: {
                      header: 'feat: test',
                    },
                  }),
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('Must be one of');
    });
  });

  describe('Complex JSON and Network Error Scenarios', () => {
    it('should handle nested JSON with complex structures', async () => {
      const diff = 'diff --git a/complex.json b/complex.json\n--- a/complex.json\n+++ b/complex.json\n@@ -1 +1 @@\n-{}\n+{"nested": {"array": [1, 2, 3]}}';
      const statusOutput = 'M  complex.json';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    analysis: {
                      changedFiles: ['complex.json'],
                      changeType: 'feat',
                      purpose: 'Add complex nested JSON structure with arrays and objects',
                      impact: 'Enables more sophisticated data handling capabilities',
                      hasSensitiveInfo: false,
                    },
                    commitMessage: {
                      header: 'feat: add complex nested JSON structure',
                      body: 'This change introduces a sophisticated nested JSON structure that includes:\n- Nested objects with multiple levels\n- Arrays containing numeric data\n- Enhanced data representation capabilities',
                      footer: 'Closes #123',
                    },
                  }),
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('sophisticated nested JSON structure');
      expect(result.returnDisplay).toContain('Commit created');
    });

    it('should handle network timeout errors gracefully', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      (mockClient.generateContent as Mock).mockRejectedValue(timeoutError);

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('timeout');
    });

    it('should handle authentication errors with detailed guidance', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      const authError = new Error('Authentication failed: Invalid API key');
      authError.name = 'AuthenticationError';
      (mockClient.generateContent as Mock).mockRejectedValue(authError);

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('Authentication');
    });

    it('should handle JSON with escaped characters and quotes', async () => {
      const diff = 'diff --git a/quotes.txt b/quotes.txt\n--- a/quotes.txt\n+++ b/quotes.txt\n@@ -1 +1 @@\n-simple\n+"complex {\\"quoted\\"} string"';
      const statusOutput = 'M  quotes.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      const complexJson = {
        analysis: {
          changedFiles: ['quotes.txt'],
          changeType: 'fix',
          purpose: 'Handle escaped quotes and special characters in strings',
          impact: 'Improves string handling reliability',
          hasSensitiveInfo: false,
        },
        commitMessage: {
          header: 'fix: handle escaped quotes in string processing',
          body: 'This change addresses issues with:\n- Escaped quote characters (\\")\n- Special character sequences\n- JSON-like structures in strings',
        },
      };

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `Here's the analysis:\n\`\`\`json\n${JSON.stringify(complexJson)}\n\`\`\`\nThis handles complex strings.`,
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('escaped quotes');
      expect(result.returnDisplay).toContain('Commit created');
    });

    it('should handle rate limiting errors with retry guidance', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      const rateLimitError = new Error('Rate limit exceeded. Try again later.');
      rateLimitError.name = 'RateLimitError';
      (mockClient.generateContent as Mock).mockRejectedValue(rateLimitError);

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('Rate limit');
    });

    it('should handle corrupted JSON responses from AI', async () => {
      const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
      const statusOutput = 'M  file.txt';
      const logOutput = 'abc1234 Previous commit message';

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': diff,
        'diff': '',
        'log': logOutput,
      }));

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '{"analysis": {"changedFiles": ["file.txt"], "changeType": "feat", "purpose": "incomplete json...', // Corrupted JSON
                },
              ],
            },
          },
        ],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toContain('Error during commit workflow');
      expect(result.llmContent).toContain('Failed to parse');
    });

    it('should truncate large diffs when token count exceeds threshold', async () => {
      const statusOutput = 'M  large-file.txt';
      const largeDiff = 'diff --git a/large-file.txt b/large-file.txt\n' + 'A'.repeat(50000); // Very large diff to exceed threshold
      const logOutput = 'abc1234 Previous commit message';

      // Create a new tool with fresh mocks for this test  
      // With 1% threshold, even small token counts will trigger truncation
      // gemini-1.5-flash limit: 1,048,576 * 0.01 = 10,485 tokens threshold
      const mockCountTokens = vi.fn().mockResolvedValue({ totalTokens: 15000 }); // Exceeds 1% threshold
      const testMockClient = {
        generateContent: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      analysis: {
                        changedFiles: ['large-file.txt'],
                        changeType: 'feat',
                        purpose: 'Add large content',
                        impact: 'Large change',
                        hasSensitiveInfo: false,
                      },
                      commitMessage: {
                        header: 'feat: add large content',
                        body: '',
                        footer: '',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
        getContentGenerator: vi.fn(() => ({
          countTokens: mockCountTokens,
        })),
      };

      const testMockConfig = {
        getGeminiClient: () => testMockClient,
        getApprovalMode: () => ApprovalMode.DEFAULT,
        setApprovalMode: vi.fn(),
        getModel: () => 'gemini-1.5-flash',
      } as unknown as Config;

      const testTool = new GenerateCommitMessageTool(testMockConfig);

      mockSpawn.mockImplementation(createGitCommandMock({
        'status': statusOutput,
        'diff --cached': largeDiff,
        'diff': '',
        'log': logOutput,
        'commit': ''
      }));

      const result = await testTool.execute(undefined, new AbortController().signal);

      // Verify that countTokens was called
      expect(mockCountTokens).toHaveBeenCalled();
      expect(result.llmContent).toContain('Commit created successfully!');
      // Verify that generateContent was called with truncated diff
      expect(testMockClient.generateContent).toHaveBeenCalled();
      const callArgs = (testMockClient.generateContent as Mock).mock.calls[0];
      const promptText = callArgs[0][0].parts[0].text;
      expect(promptText).toContain('... (diff truncated due to size limits) ...');
    });
  });
});