/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { statsCommand } from './statsCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { formatDuration } from '../utils/formatters.js';
import type { Config } from '@google/gemini-cli-core';

describe('statsCommand', () => {
  let mockContext: CommandContext;
  const startTime = new Date('2025-07-14T10:00:00.000Z');
  const endTime = new Date('2025-07-14T10:00:30.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(endTime);

    // 1. Create the mock context with all default values
    mockContext = createMockCommandContext();

    // 2. Directly set the property on the created mock context
    mockContext.session.stats.sessionStartTime = startTime;
  });

  it('should display general session stats when run with no subcommand', () => {
    if (!statsCommand.action) throw new Error('Command has no action');

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    statsCommand.action(mockContext, '');

    const expectedDuration = formatDuration(
      endTime.getTime() - startTime.getTime(),
    );
    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.STATS,
      duration: expectedDuration,
    });
  });

  it('should fetch and display quota if config is available', async () => {
    if (!statsCommand.action) throw new Error('Command has no action');

    const mockQuota = { buckets: [] };
    const mockRefreshUserQuota = vi.fn().mockResolvedValue(mockQuota);
    mockContext.services.config = {
      refreshUserQuota: mockRefreshUserQuota,
    } as unknown as Config;

    await statsCommand.action(mockContext, '');

    expect(mockRefreshUserQuota).toHaveBeenCalled();
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        quotas: mockQuota,
      }),
    );
  });

  it('should display model stats when using the "model" subcommand', () => {
    const modelSubCommand = statsCommand.subCommands?.find(
      (sc) => sc.name === 'model',
    );
    if (!modelSubCommand?.action) throw new Error('Subcommand has no action');

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    modelSubCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.MODEL_STATS,
    });
  });

  it('should display tool stats when using the "tools" subcommand', () => {
    const toolsSubCommand = statsCommand.subCommands?.find(
      (sc) => sc.name === 'tools',
    );
    if (!toolsSubCommand?.action) throw new Error('Subcommand has no action');

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    toolsSubCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.TOOL_STATS,
    });
  });
});
