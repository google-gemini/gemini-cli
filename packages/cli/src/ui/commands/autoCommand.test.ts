/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { autoCommand } from './autoCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext } from './types.js';

describe('autoCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        config: {
          enterHeadlessMode: vi.fn(),
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext);
  });

  it('should return an error when config is not available', async () => {
    const context = createMockCommandContext({
      services: { config: null },
    } as unknown as CommandContext);

    if (!autoCommand.action) throw new Error('Action missing');
    const result = await autoCommand.action(context, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Configuration not available.',
    });
  });

  it('should enable headless mode and submit args', async () => {
    if (!autoCommand.action) throw new Error('Action missing');
    const result = await autoCommand.action(mockContext, 'do the thing');

    expect(mockContext.services.config!.enterHeadlessMode).toHaveBeenCalled();
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: 'info',
        text: 'Headless mode enabled for this run; approvals will be auto-rejected.',
      },
      expect.any(Number),
    );
    expect(result).toEqual({
      type: 'submit_prompt',
      content: 'do the thing',
    });
  });

  it('should default to "continue" when no args are provided', async () => {
    if (!autoCommand.action) throw new Error('Action missing');
    const result = await autoCommand.action(mockContext, '   ');

    expect(result).toEqual({
      type: 'submit_prompt',
      content: 'continue',
    });
  });
});
