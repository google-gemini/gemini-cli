/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performRestore } from './restore.js';
import { type ToolCallData } from '../utils/checkpointUtils.js';
import type { GitService } from '../services/gitService.js';

describe('performRestore', () => {
  let mockGitService: GitService;

  beforeEach(() => {
    mockGitService = {
      initialize: vi.fn(),
      verifyGitAvailability: vi.fn(),
      setupShadowGitRepository: vi.fn(),
      getCurrentCommitHash: vi.fn(),
      createFileSnapshot: vi.fn(),
      restoreProjectFromSnapshot: vi.fn(),
      storage: {},
      getHistoryDir: vi.fn().mockReturnValue('mock-history-dir'),
      shadowGitRepository: {},
    } as unknown as GitService;
  });

  it('should yield load_history if history and clientHistory are present', async () => {
    const toolCallData: ToolCallData = {
      toolCall: { name: 'test', args: {} },
      history: [{ some: 'history' }],
      clientHistory: [{ role: 'user', parts: [{ text: 'hello' }] }],
    };

    const generator = performRestore(toolCallData, undefined);
    const result = await generator.next();

    expect(result.value).toEqual({
      type: 'load_history',
      history: toolCallData.history,
      clientHistory: toolCallData.clientHistory,
    });
    expect(result.done).toBe(false);

    const nextResult = await generator.next();
    expect(nextResult.done).toBe(true);
  });

  it('should call restoreProjectFromSnapshot and yield a message if commitHash and gitService are present', async () => {
    const toolCallData: ToolCallData = {
      toolCall: { name: 'test', args: {} },
      commitHash: 'test-commit-hash',
    };
    const spy = vi
      .spyOn(mockGitService, 'restoreProjectFromSnapshot')
      .mockResolvedValue(undefined);

    const generator = performRestore(toolCallData, mockGitService);
    const result = await generator.next();

    expect(spy).toHaveBeenCalledWith('test-commit-hash');
    expect(result.value).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Restored project to the state before the tool call.',
    });
    expect(result.done).toBe(false);

    const nextResult = await generator.next();
    expect(nextResult.done).toBe(true);
  });

  it('should yield an error message if restoreProjectFromSnapshot throws "unable to read tree" error', async () => {
    const toolCallData: ToolCallData = {
      toolCall: { name: 'test', args: {} },
      commitHash: 'invalid-commit-hash',
    };
    const spy = vi
      .spyOn(mockGitService, 'restoreProjectFromSnapshot')
      .mockRejectedValue(
        new Error('fatal: unable to read tree invalid-commit-hash'),
      );

    const generator = performRestore(toolCallData, mockGitService);
    const result = await generator.next();

    expect(spy).toHaveBeenCalledWith('invalid-commit-hash');
    expect(result.value).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        "The commit hash 'invalid-commit-hash' associated with this checkpoint could not be found in your Git repository. This can happen if the repository has been re-cloned, reset, or if old commits have been garbage collected. This checkpoint cannot be restored.",
    });
    expect(result.done).toBe(false);

    const nextResult = await generator.next();
    expect(nextResult.done).toBe(true);
  });

  it('should re-throw other errors from restoreProjectFromSnapshot', async () => {
    const toolCallData: ToolCallData = {
      toolCall: { name: 'test', args: {} },
      commitHash: 'some-commit-hash',
    };
    const testError = new Error('something went wrong');
    vi.spyOn(mockGitService, 'restoreProjectFromSnapshot').mockRejectedValue(
      testError,
    );

    const generator = performRestore(toolCallData, mockGitService);
    await expect(generator.next()).rejects.toThrow(testError);
  });

  it('should yield load_history then a message if both are present', async () => {
    const toolCallData: ToolCallData = {
      toolCall: { name: 'test', args: {} },
      history: [{ some: 'history' }],
      clientHistory: [{ role: 'user', parts: [{ text: 'hello' }] }],
      commitHash: 'test-commit-hash',
    };
    const spy = vi
      .spyOn(mockGitService, 'restoreProjectFromSnapshot')
      .mockResolvedValue(undefined);

    const generator = performRestore(toolCallData, mockGitService);

    const historyResult = await generator.next();
    expect(historyResult.value).toEqual({
      type: 'load_history',
      history: toolCallData.history,
      clientHistory: toolCallData.clientHistory,
    });
    expect(historyResult.done).toBe(false);

    const messageResult = await generator.next();
    expect(spy).toHaveBeenCalledWith('test-commit-hash');
    expect(messageResult.value).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Restored project to the state before the tool call.',
    });
    expect(messageResult.done).toBe(false);

    const nextResult = await generator.next();
    expect(nextResult.done).toBe(true);
  });

  it('should yield error message if commitHash is present but gitService is undefined', async () => {
    const toolCallData: ToolCallData = {
      toolCall: { name: 'test', args: {} },
      commitHash: 'test-commit-hash',
    };

    const generator = performRestore(toolCallData, undefined);
    const result = await generator.next();

    expect(result.value).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        'Git service is not available, cannot restore checkpoint. Please ensure you are in a git repository.',
    });
    expect(result.done).toBe(false);

    const nextResult = await generator.next();
    expect(nextResult.done).toBe(true);
  });
});
