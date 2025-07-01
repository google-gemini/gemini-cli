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
  let mockSetShowHelp: ReturnType<typeof vi.fn>;
  let mockOnDebugMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSetShowHelp = vi.fn();
    mockOnDebugMessage = vi.fn();

    mockContext = {
      dialogs: {
        setShowHelp: mockSetShowHelp,
      },
      utils: {
        onDebugMessage: mockOnDebugMessage,
      },
    } as unknown as CommandContext;
  });

  it("should call setShowHelp(true) and log a debug message for '/help'", () => {
    helpCommand.action(mockContext, { mainCommand: 'help', rest: '' });

    expect(mockSetShowHelp).toHaveBeenCalledWith(true);
    expect(mockOnDebugMessage).toHaveBeenCalledWith('Opening help.');
  });

  it("should also be triggered by its alternative name '?'", () => {
    // This test is more conceptual. The routing of altName to the command
    // is handled by the slash command processor, but we can assert the
    // altName is correctly defined on the command object itself.
    expect(helpCommand.altName).toBe('?');
  });
});
