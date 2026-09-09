/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { tasksCommand } from './tasksCommand.js';
import type { CommandContext } from './types.js';

describe('tasksCommand', () => {
  it('should call toggleBackgroundTasks', async () => {
    const toggleBackgroundTasks = vi.fn();
    const context = {
      ui: {
        toggleBackgroundTasks,
      },
    } as unknown as CommandContext;

    if (tasksCommand.action) {
      await tasksCommand.action(context, '');
    }

    expect(toggleBackgroundTasks).toHaveBeenCalled();
  });

  it('should have correct name and altNames', () => {
    expect(tasksCommand.name).toBe('tasks');
    expect(tasksCommand.altNames).toContain('bg');
    expect(tasksCommand.altNames).toContain('background');
  });

  it('should auto-execute', () => {
    expect(tasksCommand.autoExecute).toBe(true);
  });
});
