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

const COMMIT_MESSAGE_PROMPT_LINES = [
  'You are an expert software engineer specializing in writing concise and meaningful git commit messages.',
  'Your task is to generate a commit message in the Conventional Commits format based on the provided git diff.',
  '',
  '# Process',
  '1. **Analyze the Diff**: In an <analysis> block, first reason about the changes. Summarize the core changes and infer the overall purpose (the "why"). Determine the most appropriate `type` and `scope`.',
  '2. **Generate the Commit Message**: Based on your analysis, generate the final commit message. Remember to focus on the *why* behind the change, not just the *what*.',
  '',
  '# Commit Message Format',
  '- **Header**: `type(scope): subject`. The header must be lowercase. The `type` must be one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.',
  '- **Body**: Optional. Use it to explain the "what" and "why" of the change. Use the imperative, present tense (e.g., "change" not "changed").',
  '- **Footer**: Optional. For BREAKING CHANGES and referencing issues.',
  '',
  '# Examples',
  '',
  '```',
  'feat(home): add ad',
  '- Introduced the @ctrl/react-adsense package to enable Google AdSense integration in the application.',
  '- Updated package.json and pnpm-lock.yaml to include the new dependency.',
  '- Added the Adsense component in page.tsx to display ads, enhancing monetization opportunities.',
  '- Included a script tag in layout.tsx for loading the AdSense script asynchronously.',
  '',
  "These changes improve the application's revenue potential while maintaining a clean and organized codebase.",
  '```',
  '',
  '```',
  'refactor(cmpts)!: rename input form',
  '- Renamed `InputForm.tsx` to `input-form.tsx` to follow consistent naming conventions.',
  '- Updated the import path in `app/page.tsx` to reflect the renamed file.',
  '',
  'BREAKING CHANGE: This change renames `InputForm.tsx` to `input-form.tsx`, which will require updates to any imports referencing the old file name.',
  '```',
  '',
  '# Git Diff to Analyze',
  '```diff',
  '@{{diff}}',
  '```',
];

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

  it('should return a message when there are no changes', async () => {
    mockSpawn.mockImplementation((_command, _args) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: { on: ReturnType<typeof vi.fn> };
        stderr: { on: ReturnType<typeof vi.fn> };
      };
      child.stdout = { on: vi.fn() };
      child.stderr = { on: vi.fn() };
      process.nextTick(() => child.emit('close', 0));
      return child;
    });

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

    expect(result.llmContent).toBe('Error: Git diff command failed: git error');
    expect(result.returnDisplay).toBe('Error: Git diff command failed: git error');
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });

  it('should generate a commit message when there are staged changes', async () => {
    const diff =
      'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';

    mockSpawn.mockImplementationOnce((_command, _args) => {
      // Staged diff call
      const child = new EventEmitter() as EventEmitter & {
        stdout: { on: ReturnType<typeof vi.fn> };
        stderr: { on: ReturnType<typeof vi.fn> };
      };
      child.stdout = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        if (event === 'data') listener(Buffer.from(diff));
      }) };
      child.stderr = { on: vi.fn() };
      process.nextTick(() => child.emit('close', 0));
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

    const expectedPrompt = COMMIT_MESSAGE_PROMPT_LINES.join('\n').replace(
      /@\{\{diff\}\}'/g,
      diff,
    );

    expect(result.llmContent).toBe('feat: new feature');
    expect(result.returnDisplay).toBe('feat: new feature');
    expect(mockClient.generateContent).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          parts: [
            {
              text: expect.stringContaining(diff), // Use stringContaining for the diff part
            },
          ],
        },
      ],
      {},
      controller.signal,
    );
  });

  it('should generate a commit message when there are only unstaged changes', async () => {
    const diff =
      'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new';

    // Mock for staged diff (no changes)
    mockSpawn.mockImplementationOnce((_command, _args) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: { on: ReturnType<typeof vi.fn> };
        stderr: { on: ReturnType<typeof vi.fn> };
      };
      child.stdout = { on: vi.fn() };
      child.stderr = { on: vi.fn() };
      process.nextTick(() => child.emit('close', 0));
      return child;
    });

    // Mock for unstaged diff (with changes)
    mockSpawn.mockImplementationOnce((_command, _args) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: { on: ReturnType<typeof vi.fn> };
        stderr: { on: ReturnType<typeof vi.fn> };
      };
      child.stdout = { on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        if (event === 'data') listener(Buffer.from(diff));
      }) };
      child.stderr = { on: vi.fn() };
      process.nextTick(() => child.emit('close', 0));
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

    const expectedPrompt = COMMIT_MESSAGE_PROMPT_LINES.join('\n').replace(
      /@\{\{diff\}\}'/g,
      diff,
    );

    expect(result.llmContent).toBe('feat: new feature');
    expect(result.returnDisplay).toBe('feat: new feature');
    expect(mockClient.generateContent).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          parts: [
            {
              text: expect.stringContaining(diff), // Use stringContaining for the diff part
            },
          ],
        },
      ],
      {},
      controller.signal,
    );
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

    expect(result.llmContent).toBe(
      `Error: Failed to spawn git process: ${mockError.message}`,
    );
    expect(result.returnDisplay).toBe(
      `Error: Failed to spawn git process: ${mockError.message}`,
    );
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });
});