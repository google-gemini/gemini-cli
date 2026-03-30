/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loopCommand } from './loopCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { cronSchedulerService } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    cronSchedulerService: {
      scheduleTask: vi.fn(),
    },
  };
});

describe('loopCommand', () => {
  let mockContext: ReturnType<typeof createMockCommandContext>;

  beforeEach(() => {
    mockContext = createMockCommandContext();
    vi.clearAllMocks();
  });

  it('should print an error if no args are provided', async () => {
    mockContext.invocation!.args = '  ';
    await loopCommand.action!(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('Please provide a prompt'),
      }),
    );
  });

  it('should default to 10m if no interval is provided', async () => {
    mockContext.invocation!.args = 'check the build';
    vi.mocked(cronSchedulerService.scheduleTask).mockReturnValue('abc12345');

    await loopCommand.action!(mockContext, '');

    expect(cronSchedulerService.scheduleTask).toHaveBeenCalledWith(
      '10m',
      'check the build',
      true,
    );
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('every 10m'),
      }),
    );
  });

  it('should parse leading interval', async () => {
    mockContext.invocation!.args = '5m check the build';
    vi.mocked(cronSchedulerService.scheduleTask).mockReturnValue('def56789');

    await loopCommand.action!(mockContext, '');

    expect(cronSchedulerService.scheduleTask).toHaveBeenCalledWith(
      '5m',
      'check the build',
      true,
    );
  });

  it('should handle scheduling errors', async () => {
    mockContext.invocation!.args = 'invalid check the build';
    vi.mocked(cronSchedulerService.scheduleTask).mockImplementation(() => {
      throw new Error('Invalid format');
    });

    await loopCommand.action!(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          'Failed to schedule task: Invalid format',
        ),
      }),
    );
  });
});
