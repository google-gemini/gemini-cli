/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { helpCommand } from './helpCommand.js';
import { type CommandContext } from './types.js';

describe('helpCommand', () => {
  let mockContext: CommandContext;
  let mockOpenHelp: ReturnType<typeof vi.fn>;
  let mockOnDebugMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOpenHelp = vi.fn();
    mockOnDebugMessage = vi.fn();

    mockContext = {
      dialogs: {
        openHelp: mockOpenHelp,
      },
      ui: {
        setDebugMessage: mockOnDebugMessage,
      },
    } as unknown as CommandContext;
  });

  it("should call setShowHelp(true) and set a debug message for '/help'", () => {
    if (!helpCommand.action) {
      throw new Error('Help command has no action');
    }
    helpCommand.action(mockContext, '');

    expect(mockOpenHelp).toHaveBeenCalled();
    expect(mockOnDebugMessage).toHaveBeenCalledWith('Opening help.');
  });

  it("should also be triggered by its alternative name '?'", () => {
    // This test is more conceptual. The routing of altName to the command
    // is handled by the slash command processor, but we can assert the
    // altName is correctly defined on the command object itself.
    expect(helpCommand.altName).toBe('?');
  });
});
