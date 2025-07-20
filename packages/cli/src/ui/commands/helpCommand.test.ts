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

  beforeEach(() => {
    mockContext = {} as unknown as CommandContext;
  });

  it("should return a dialog action and log a debug message for '/help'", () => {
    const consoleDebugSpy = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => {});
    if (!helpCommand.action) {
      throw new Error('Help command has no action');
    }
    const result = helpCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'help',
    });
    expect(consoleDebugSpy).toHaveBeenCalledWith('Opening help UI ...');
  });

  it("should also be triggered by its alternative name '?'", () => {
    // This test is more conceptual. The routing of altNames to the command
    // is handled by the slash command processor, but we can assert the
    // altNames is correctly defined on the command object itself.
    expect(helpCommand.altNames).toContain('?');
  });
});
