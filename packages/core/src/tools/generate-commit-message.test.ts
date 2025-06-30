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
    const diff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
    const statusOutput = 'M  file.txt';
    const logOutput = 'abc1234 Previous commit message';

    mockSpawn.mockImplementation(createGitCommandMock({
      'status': statusOutput,
      'diff --cached': diff,
      'diff': '', // No unstaged changes
      'log': logOutput,
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
    
    // Verify git commands were called in correct sequence
    expect(mockSpawn).toHaveBeenCalledWith('git', ['status', '--porcelain'], expect.any(Object));
    expect(mockSpawn).toHaveBeenCalledWith('git', ['diff', '--cached'], expect.any(Object));
    expect(mockSpawn).toHaveBeenCalledWith('git', ['commit', '-m', 'feat: new feature'], expect.any(Object));
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
    expect(mockSpawn).toHaveBeenCalledWith('git', ['add', '-u'], expect.any(Object));
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
            parts: [{ text: 'feat: mixed changes' }],
          },
        },
      ],
    });

    const controller = new AbortController();
    const result = await tool.execute(undefined, controller.signal);

    expect(result.llmContent).toBe('Commit created successfully!\n\nCommit message:\nfeat: mixed changes');
    expect(result.returnDisplay).toBe('Commit created successfully!\n\nCommit message:\nfeat: mixed changes');
    
    // In the non-cached path, it should check for untracked files and stage them
    expect(mockSpawn).toHaveBeenCalledWith('git', ['add', 'newfile.txt'], expect.any(Object));
  });
});