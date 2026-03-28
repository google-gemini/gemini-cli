/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { loopCommand } from './loopCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('loopCommand', () => {
  it('has the expected metadata', () => {
    expect(loopCommand.name).toBe('loop');
    expect(loopCommand.description).toBe(
      'Queue a recurring message every Xm: /loop 3m continue',
    );
    expect(loopCommand.isSafeConcurrent).toBe(true);
  });

  it('schedules a loop in interactive mode', async () => {
    const scheduleLoop = vi.fn(() => true);
    const context = createMockCommandContext({
      ui: {
        scheduleLoop,
      },
    });

    if (!loopCommand.action) {
      throw new Error('loopCommand must have an action.');
    }

    const result = await loopCommand.action(context, '5m continue');

    expect(scheduleLoop).toHaveBeenCalledWith({
      intervalMs: 300_000,
      intervalSpec: '5m',
      prompt: 'continue',
    });
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Scheduled /loop every 5m: continue',
    });
  });

  it('returns an error for invalid syntax', async () => {
    const context = createMockCommandContext();

    if (!loopCommand.action) {
      throw new Error('loopCommand must have an action.');
    }

    const result = await loopCommand.action(context, 'bad');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Usage: /loop <interval Xm> <message>',
    });
  });

  it('returns an error outside interactive mode', async () => {
    const context = createMockCommandContext({
      ui: {
        scheduleLoop: vi.fn(() => false),
      },
    });

    if (!loopCommand.action) {
      throw new Error('loopCommand must have an action.');
    }

    const result = await loopCommand.action(context, '5m continue');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'The /loop command is only available in interactive sessions.',
    });
  });
});
