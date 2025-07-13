/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { pasteCommand } from './pasteCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { CommandContext } from './types.js';

describe('pasteCommand', () => {
  let context: CommandContext;

  beforeEach(() => {
    context = createMockCommandContext();
    // Add the new methods to the mock context
    context.ui.setInputMode = vi.fn();
    context.ui.clearPastedContent = vi.fn();
  });

  it('should set input mode to "paste" when called with no arguments', async () => {
    const result = await pasteCommand.action(context, '');
    expect(context.ui.setInputMode).toHaveBeenCalledWith('paste');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Paste your data and press Enter. Press Esc to cancel.',
    });
  });

  it('should call clearPastedContent when called with --clear', async () => {
    const result = await pasteCommand.action(context, ' --clear ');
    expect(context.ui.clearPastedContent).toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Staged images cleared.',
    });
  });
});
