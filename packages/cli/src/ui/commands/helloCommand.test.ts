/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { helloCommand } from './helloCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType, type HistoryItemInfo } from '../types.js';

describe('helloCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
    vi.spyOn(mockContext.ui, 'addItem');
  });

  it('should call the addItem function on the UI context', async () => {
    if (!helloCommand.action) {
      throw new Error('The hello command must have an action.');
    }

    await helloCommand.action(mockContext, '');

    const expectedItem: Omit<HistoryItemInfo, 'id'> = {
      type: MessageType.INFO,
      text: 'Hello, world!',
    };

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expectedItem,
      expect.any(Number),
    );
  });

  it('should have the correct name and description', () => {
    expect(helloCommand.name).toBe('hello');
    expect(helloCommand.description).toBe('Prints a friendly greeting.');
  });
});
