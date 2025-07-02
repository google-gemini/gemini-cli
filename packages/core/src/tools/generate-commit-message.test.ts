/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { GenerateCommitMessageTool } from './generate-commit-message.js';
import { Config, ApprovalMode } from '../config/config.js';
import { ToolConfirmationOutcome } from './tools.js';
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
  })),
}));

// Helper function to create git command mock
function createGitCommandMock(outputs: { [key: string]: string }) {
  return (_command: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: { on: ReturnType<typeof vi.fn> };
      stderr: { on: ReturnType<typeof vi.fn> };
    };
    
    child.stdout = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
      if (event === 'data') {
        const argString = args.join(' ');
        for (const [pattern, output] of Object.entries(outputs)) {
          if (argString.includes(pattern)) {
            listener(Buffer.from(output));
            break;
          }
        }
      }
    }) };
    
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
    mockClient = new GeminiClient(mockConfig);
    mockConfig = {
      getGeminiClient: () => mockClient,
      getApprovalMode: () => ApprovalMode.DEFAULT,
      setApprovalMode: vi.fn(),
    } as unknown as Config;
    tool = new GenerateCommitMessageTool(mockConfig);
    vi.clearAllMocks();
    mockSpawn = spawn as Mock;
  });

  it('should return a message when there are no changes', async () => {
    mockSpawn.mockImplementation(createGitCommandMock({
      'status --porcelain': '',
      'diff --cached': '',
      'diff': '',
      'log --oneline': 'abc1234 Previous commit'
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
    const commitMessage = 'feat: new feature';

    const mockStdin = {
      write: vi.fn(),
      end: vi.fn(),
    };

    mockSpawn.mockImplementation((command: string, args: string[]) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: { on: ReturnType<typeof vi.fn> };
        stderr: { on: ReturnType<typeof vi.fn> };
        stdin?: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      };
      const argString = args.join(' ');

      if (command === 'git' && argString === 'commit -F -') {
        child.stdin = mockStdin;
      }

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
      process.nextTick(() => child.emit('close', 0));
      return child;
    });

    (mockClient.generateContent as Mock).mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: commitMessage }],
          },
        },
      ],
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
    expect(mockStdin.write).toHaveBeenCalledWith(
      expect.stringContaining(commitMessage),
    );
    expect(mockStdin.end).toHaveBeenCalled();
  });

  it('should generate a commit message when there are only unstaged changes', async () => {
    const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
    const statusOutput = ' M file.txt';
    const logOutput = 'abc1234 Previous commit message';

    mockSpawn.mockImplementation(createGitCommandMock({
      'status --porcelain': statusOutput,
      'diff --cached': '', // No staged changes
      diff,
      'log --oneline': logOutput,
      add: '',
      'commit': ''
    }));

    (mockClient.generateContent as Mock).mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'feat: new feature' }],
          },
        },
      ],
    });

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

  it('should handle pre-commit hook modifications and retry with appropriate staging strategy', async () => {
    const testCases = [
      {
        name: 'all-changes mode',
        statusOutput: 'M  file.txt\n M file2.txt', // Mixed changes
        stagedDiff: 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new',
        unstagedDiff: 'diff --git a/file2.txt b/file2.txt\n--- a/file2.txt\n+++ b/file2.txt\n@@ -1 +1 @@\n-old2\n+new2',
        expectAddCalls: true
      },
      {
        name: 'staged-only mode',
        statusOutput: 'M  file.txt', // Only staged changes
        stagedDiff: 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new',
        unstagedDiff: '',
        expectAddCalls: false
      }
    ];

    for (const testCase of testCases) {
      let commitCallCount = 0;
      mockSpawn.mockImplementation((_command, args) => {
        const child = new EventEmitter() as EventEmitter & {
          stdout: { on: ReturnType<typeof vi.fn> };
          stderr: { on: ReturnType<typeof vi.fn> };
        };
        
        child.stdout = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
          if (event === 'data') {
            const argString = args.join(' ');
            if (argString.includes('status')) {
              listener(Buffer.from(testCase.statusOutput));
            } else if (argString.includes('diff --cached')) {
              listener(Buffer.from(testCase.stagedDiff));
            } else if (argString.includes('diff') && !argString.includes('--cached')) {
              listener(Buffer.from(testCase.unstagedDiff));
            } else if (argString.includes('log')) {
              listener(Buffer.from('abc1234 Previous commit message'));
            } else {
              listener(Buffer.from(''));
            }
          }
        }) };
        
        child.stderr = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
          if (event === 'data' && args.includes('commit') && commitCallCount === 0) {
            listener(Buffer.from('pre-commit hook failed'));
          }
        }) };
        
        process.nextTick(() => {
          if (args.includes('commit')) {
            commitCallCount++;
            child.emit('close', commitCallCount === 1 ? 1 : 0); // First fails, second succeeds
          } else {
            child.emit('close', 0);
          }
        });
        
        return child;
      });

      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'feat: test changes' }] } }],
      });

      const result = await tool.execute(undefined, new AbortController().signal);

      expect(result.llmContent).toBe('Commit created successfully after pre-commit hook modifications!\n\nCommit message:\nfeat: test changes');
      
      const addCalls = mockSpawn.mock.calls.filter(call => 
        call[0] === 'git' && call[1]?.includes('add') && call[1]?.includes('.')
      );
      
      if (testCase.expectAddCalls) {
        expect(addCalls.length).toBeGreaterThanOrEqual(1);
      } else {
        expect(addCalls).toHaveLength(0);
      }
      
      expect(commitCallCount).toBe(2);
      vi.clearAllMocks();
    }
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
    const stagedDiff = 'diff --git a/file.txt b/file.txt\n@@ -1 +1 @@\n-line2\n+line2 modified';
    const unstagedDiff = 'diff --git a/file.txt b/file.txt\n@@ -2 +2 @@\n+line3 added';

    mockSpawn.mockImplementation(createGitCommandMock({
      'status --porcelain': statusOutput,
      'diff --cached': stagedDiff,
      'diff': unstagedDiff,
      'log --oneline': logOutput,
      add: '',
      'commit': ''
    }));

    (mockClient.generateContent as Mock).mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'feat: mixed changes' }],
          },
        },
      ],
    });

    const controller = new AbortController();
    const result = await tool.execute(undefined, controller.signal);

    expect(result.llmContent).toBe('Commit created successfully!\n\nCommit message:\nfeat: mixed changes');
    expect(result.returnDisplay).toBe('Commit created successfully!\n\nCommit message:\nfeat: mixed changes');
    
    // Verify AI receives combined diff for mixed changes scenario
    expect(mockClient.generateContent).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          parts: [
            {
              text: expect.stringContaining('line2 modified'),
            },
          ],
        },
      ],
      {},
      controller.signal,
    );
    
    // Should stage all changes before committing
    expect(mockSpawn).toHaveBeenCalledWith('git', ['add', '.'], expect.any(Object));
  });

  it('should use only staged diff when only staged changes exist', async () => {
    const statusOutput = 'M  file.txt';
    const logOutput = 'abc1234 Previous commit message';
    const stagedDiff = 'diff --git a/file.txt b/file.txt\n@@ -1 +1 @@\n-old\n+new';

    // Spy on console.debug to capture debug output
    const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Use a more specific mock that clearly separates the git commands
    mockSpawn.mockImplementation((_command: string, args: string[]) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: { on: ReturnType<typeof vi.fn> };
        stderr: { on: ReturnType<typeof vi.fn> };
        stdin?: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      };
      
      const argString = args.join(' ');
      let output = '';
      
      if (argString === 'status --porcelain') {
        output = statusOutput;
      } else if (argString === 'diff --cached') {
        output = stagedDiff;
      } else if (argString === 'diff') {
        output = ''; // No unstaged changes
      } else if (argString === 'log --oneline -10') {
        output = logOutput;
      } else if (argString === 'commit -F -') {
        child.stdin = { write: vi.fn(), end: vi.fn() };
        output = '';
      } else if (argString === 'add .') {
        output = ''; // Handle git add . command
      }
      
      child.stdout = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        if (event === 'data') {
          listener(Buffer.from(output));
        }
      }) };
      
      child.stderr = { on: vi.fn() };
      process.nextTick(() => child.emit('close', 0));
      return child;
    });

    (mockClient.generateContent as Mock).mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'feat: staged only changes' }],
          },
        },
      ],
    });

    const controller = new AbortController();
    const result = await tool.execute(undefined, controller.signal);

    expect(result.llmContent).toBe('Commit created successfully!\n\nCommit message:\nfeat: staged only changes');
    
    // Verify AI receives only staged diff
    expect(mockClient.generateContent).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          parts: [
            {
              text: expect.stringContaining('-old\n+new'),
            },
          ],
        },
      ],
      {},
      controller.signal,
    );
    
    // Should NOT stage additional changes - verify that git add . was not called
    const addCalls = mockSpawn.mock.calls.filter(call => 
      call[0] === 'git' && call[1] && call[1].includes('add') && call[1].includes('.')
    );

    // Debug: Collect debug info for failure message
    const debugMessages = consoleDebugSpy.mock.calls.map((call, index) => 
      `${index}: ${call.join(' ')}`
    ).join('\n');
    
    const gitCommands = mockSpawn.mock.calls.map((call, index) => 
      `${index}: git ${call[1]?.join(' ')}`
    ).join('\n');


    expect(addCalls).toHaveLength(0);
    if (addCalls.length > 0) {
      throw new Error(
        `Expected no 'git add .' calls, but found ${addCalls.length}.\n\n` +
        `Debug Messages:\n${debugMessages}\n\n` +
        `Git Commands:\n${gitCommands}`
      );
    }

    // Clean up spy
    consoleDebugSpy.mockRestore();
  });
});
