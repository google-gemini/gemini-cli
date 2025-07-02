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
      stdin?: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    };

    if (args.includes('commit')) {
      child.stdin = { write: vi.fn(), end: vi.fn() };
    }
    
    child.stdout = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
      if (event === 'data') {
        const argString = args.join(' ');
        for (const [pattern, output] of Object.entries(outputs)) {
          if (argString.includes(pattern)) {
            listener(Buffer.from(output));
            return;
          }
        }
        // Default empty response if no pattern matches
        listener(Buffer.from(''));
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
    }));

    const result = await tool.execute(undefined, new AbortController().signal);

    expect(result.llmContent).toBe(
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
    expect(mockClient.generateContent).toHaveBeenCalled();
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
  
  it('should return "no changes" when there are only unstaged changes', async () => {
    mockSpawn.mockImplementation(createGitCommandMock({
      'status --porcelain': ' M file.txt',
      'diff --cached': '', // No staged changes
    }));

    const controller = new AbortController();
    const result = await tool.execute(undefined, controller.signal);

    expect(result.llmContent).toBe('No changes detected in the current workspace.');
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });

  it('should return an error on pre-commit hook failure', async () => {
    let commitCallCount = 0;
    const stagedDiff = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
    const statusOutput = 'M  file.txt';

    const mockStdin = { write: vi.fn(), end: vi.fn() };

    mockSpawn.mockImplementation((_command, args) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: { on: ReturnType<typeof vi.fn> };
        stderr: { on: ReturnType<typeof vi.fn> };
        stdin: typeof mockStdin;
      };

      child.stdin = mockStdin;
      
      child.stdout = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        if (event === 'data') {
          const argString = args.join(' ');
          if (argString.includes('status')) listener(Buffer.from(statusOutput));
          else if (argString.includes('diff --cached')) listener(Buffer.from(stagedDiff));
          else if (argString.includes('log')) listener(Buffer.from('abc1234 Previous commit'));
          else listener(Buffer.from(''));
        }
      }) };
      
      child.stderr = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        if (event === 'data' && args.includes('commit') && commitCallCount === 0) {
          listener(Buffer.from('error in .git/hooks/pre-commit'));
        }
      }) };
      
      process.nextTick(() => {
        if (args.includes('commit')) {
          commitCallCount++;
          child.emit('close', 1); // Fail commit
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

    expect(result.llmContent).toContain('Commit failed due to a pre-commit hook');
    expect(result.llmContent).toContain('error in .git/hooks/pre-commit');
    expect(commitCallCount).toBe(1);
    const addCalls = mockSpawn.mock.calls.filter(call => call[1]?.includes('add'));
    expect(addCalls).toHaveLength(0);
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
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });

  it('should only use staged changes for commit message when mixed changes exist', async () => {
    const statusOutput = 'MM file.txt\n?? newfile.txt';
    const logOutput = 'abc1234 Previous commit message';
    const stagedDiff = 'diff --git a/file.txt b/file.txt\n@@ -1 +1 @@\n-staged\n+staged modified';

    mockSpawn.mockImplementation(createGitCommandMock({
      'status --porcelain': statusOutput,
      'diff --cached': stagedDiff,
      'log --oneline': logOutput,
    }));

    (mockClient.generateContent as Mock).mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'feat: handle staged' }] } }],
    });

    const controller = new AbortController();
    await tool.execute(undefined, controller.signal);

    const generateContentCalls = (mockClient.generateContent as Mock).mock.calls;
    expect(generateContentCalls.length).toBe(1);
    const promptText = generateContentCalls[0][0][0].parts[0].text;
    expect(promptText).toContain('-staged\n+staged modified');
    
    const addCalls = mockSpawn.mock.calls.filter(call => 
      call[0] === 'git' && call[1]?.includes('add')
    );
    expect(addCalls).toHaveLength(0);
  });
});
