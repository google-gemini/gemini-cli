/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { helpCommand } from './helpCommand.js';
import { type CommandContext, SlashCommand } from './types.js';

describe('helpCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    const commands: readonly SlashCommand[] = [
      { name: 'test', description: 'A test command' },
      { name: 'another', description: 'Another test command' },
    ] as readonly SlashCommand[];

    mockContext = {
      commands,
    } as unknown as CommandContext;
  });

  it("should return a message with a list of commands for '/help'", () => {
    if (!helpCommand.action) {
      throw new Error('Help command has no action');
    }
    const result = helpCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: `Available commands:\n/test - A test command\n/another - Another test command`,
    });
  });

  it("should also be triggered by its alternative name '?'", () => {
    // This test is more conceptual. The routing of altNames to the command
    // is handled by the slash command processor, but we can assert the
    // altNames is correctly defined on the command object itself.
    expect(helpCommand.altNames).toContain('?');
  });
});
