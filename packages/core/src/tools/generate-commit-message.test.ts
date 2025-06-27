/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { GenerateCommitMessageTool } from './generate-commit-message.js';
import { Config } from '../config/config.js';
import { spawn } from 'child_process';
import { GeminiClient } from '../core/client.js';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    generateContent: vi.fn(),
  })),
}));

describe('GenerateCommitMessageTool', () => {
  let tool: GenerateCommitMessageTool;
  let mockConfig: Config;
  let mockClient: GeminiClient;
  let mockSpawn: Mock;

  beforeEach(() => {
    mockClient = new GeminiClient(mockConfig);
    mockConfig = {
      getGeminiClient: () => mockClient,
    } as unknown as Config;
    tool = new GenerateCommitMessageTool(mockConfig);
    vi.clearAllMocks();
    mockSpawn = spawn as Mock;
  });

  // Helper to mock spawn behavior
  const mockSpawnProcess = (
    stagedStdout: string,
    stagedStderr: string,
    stagedExitCode: number,
    unstagedStdout: string = '',
    unstagedStderr: string = '',
    unstagedExitCode: number = 0,
  ) => {
    let callCount = 0;
    mockSpawn.mockImplementation((command, args) => {
      callCount++;
      if (args.includes('--cached')) {
        // Staged diff call
        const mockChild = {
          stdout: {
            on: vi.fn((event: string, listener: (data: Buffer) => void) => {
              if (event === 'data') listener(Buffer.from(stagedStdout));
            }),
          },
          stderr: {
            on: vi.fn((event: string, listener: (data: Buffer) => void) => {
              if (event === 'data') listener(Buffer.from(stagedStderr));
            }),
          },
          on: vi.fn(
            (event: string, listener: (code: number, signal: string) => void) => {
              if (event === 'close') listener(stagedExitCode, '');
            },
          ),
        };
        return mockChild;
      } else {
        // Unstaged diff call
        const mockChild = {
          stdout: {
            on: vi.fn((event: string, listener: (data: Buffer) => void) => {
              if (event === 'data') listener(Buffer.from(unstagedStdout));
            }),
          },
          stderr: {
            on: vi.fn((event: string, listener: (data: Buffer) => void) => {
              if (event === 'data') listener(Buffer.from(unstagedStderr));
            }),
          },
          on: vi.fn(
            (event: string, listener: (code: number, signal: string) => void) => {
              if (event === 'close') listener(unstagedExitCode, '');
            },
          ),
        };
        return mockChild;
      }
    });
  };

  it('should return a message when there are no changes', async () => {
    mockSpawnProcess('', '', 0, '', '', 0);

    const result = await tool.execute(undefined, new AbortController().signal);

    expect(result.llmContent).toBe(
      'No changes detected in the current workspace.',
    );
    expect(result.returnDisplay).toBe(
      'No changes detected in the current workspace.',
    );
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });

  it('should return an error when git diff fails', async () => {
    mockSpawnProcess('', 'git error', 1);

    const result = await tool.execute(undefined, new AbortController().signal);

    expect(result.llmContent).toBe('Error getting git diff: git error');
    expect(result.returnDisplay).toBe('Error getting git diff: git error');
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });

  it('should generate a commit message when there are staged changes', async () => {
    const diff =
      'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
    mockSpawnProcess(diff, '', 0);
    (mockClient.generateContent as Mock).mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'feat: new feature' }],
          },
        },
      ],
    });

    const result = await tool.execute(undefined, new AbortController().signal);

    expect(result.llmContent).toBe('feat: new feature');
    expect(result.returnDisplay).toBe('feat: new feature');
    expect(mockClient.generateContent).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          parts: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining(diff),
            }),
          ]),
        }),
      ]),
      {},
      expect.any(AbortSignal),
    );
  });

  it('should generate a commit message when there are only unstaged changes', async () => {
    const diff =
      'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';
    // No staged changes, but unstaged changes
    mockSpawnProcess('', '', 0, diff, '', 0);
    (mockClient.generateContent as Mock).mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'feat: new feature' }],
          },
        },
      ],
    });

    const result = await tool.execute(undefined, new AbortController().signal);

    expect(result.llmContent).toBe('feat: new feature');
    expect(result.returnDisplay).toBe('feat: new feature');
    expect(mockClient.generateContent).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          parts: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining(diff),
            }),
          ]),
        }),
      ]),
      {},
      expect.any(AbortSignal),
    );
  });

  it('should return an error when spawn process fails to start', async () => {
    const mockError = new Error('spawn error');
    // For the error event, the listener only receives the error object, not code/signal
    mockSpawn.mockImplementationOnce(
      (_command: string, _args: string[], _options: object) => {
        const child = new EventEmitter() as EventEmitter & {
          stdout: { on: ReturnType<typeof vi.fn> };
          stderr: { on: ReturnType<typeof vi.fn> };
        };
        child.stdout = { on: vi.fn() };
        child.stderr = { on: vi.fn() };
        process.nextTick(() => child.emit('error', mockError));
        return child;
      },
    );

    const result = await tool.execute(undefined, new AbortController().signal);

    expect(result.llmContent).toBe(
      `Failed to start git diff process: ${mockError.message}`,
    );
    expect(result.returnDisplay).toBe(
      `Failed to start git diff process: ${mockError.message}`,
    );
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });
});
