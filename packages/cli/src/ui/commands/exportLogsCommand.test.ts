/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { exportLogsCommand } from './exportLogsCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext } from './types.js';

vi.mock('../hooks/useConsoleMessages.js', () => ({
  getConsoleMessages: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { getConsoleMessages } from '../hooks/useConsoleMessages.js';
import * as fsPromises from 'node:fs/promises';

describe('exportLogsCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockCommandContext({});
  });

  it('should return error when no console logs exist', async () => {
    vi.mocked(getConsoleMessages).mockReturnValue([]);

    const result = await exportLogsCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'No console logs to export.',
    });
  });

  it('should export logs to default filename', async () => {
    vi.mocked(getConsoleMessages).mockReturnValue([
      { type: 'log', content: 'test message', count: 1 },
    ]);

    const result = await exportLogsCommand.action!(mockContext, '');

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      type: 'message',
      messageType: 'info',
    });
  });

  it('should export logs to custom filename', async () => {
    vi.mocked(getConsoleMessages).mockReturnValue([
      { type: 'error', content: 'error message', count: 1 },
    ]);

    const result = await exportLogsCommand.action!(mockContext, 'my-logs.json');

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('my-logs.json'),
    });
  });

  it('should reject non-json file extension', async () => {
    vi.mocked(getConsoleMessages).mockReturnValue([
      { type: 'log', content: 'test', count: 1 },
    ]);

    const result = await exportLogsCommand.action!(mockContext, 'logs.txt');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Only .json format is supported for log export.',
    });
    expect(fsPromises.writeFile).not.toHaveBeenCalled();
  });

  it('should handle write errors', async () => {
    vi.mocked(getConsoleMessages).mockReturnValue([
      { type: 'log', content: 'test', count: 1 },
    ]);
    vi.mocked(fsPromises.writeFile).mockRejectedValue(
      new Error('permission denied'),
    );

    const result = await exportLogsCommand.action!(mockContext, '');

    expect(result).toMatchObject({
      type: 'message',
      messageType: 'error',
      content: expect.stringContaining('permission denied'),
    });
  });
});
