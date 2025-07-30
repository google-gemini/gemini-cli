/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { helpCommand } from './helpCommand.js';
import { type CommandContext, CommandKind } from './types.js';

describe('helpCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = {
      slashCommands: [
        {
          name: 'test',
          description: 'Test command',
          kind: CommandKind.BUILT_IN,
        },
        { name: 'help', description: 'Show help', kind: CommandKind.BUILT_IN },
      ],
    } as unknown as CommandContext;
  });

  it("should return a message action with help content for '/help'", () => {
    if (!helpCommand.action) {
      throw new Error('Help command has no action');
    }
    const result = helpCommand.action(mockContext, '');

    expect(result).toMatchObject({
      type: 'message',
      messageType: 'help',
    });
    expect(result.content).toContain('**Basics:**');
    expect(result.content).toContain('**Commands:**');
    expect(result.content).toContain('**Keyboard Shortcuts:**');
    expect(result.content).toContain(' **/test** - Test command');
    expect(result.content).toContain(' **/help** - Show help');
  });

  it("should also be triggered by its alternative name '?'", () => {
    // This test is more conceptual. The routing of altNames to the command
    // is handled by the slash command processor, but we can assert the
    // altNames is correctly defined on the command object itself.
    expect(helpCommand.altNames).toContain('?');
  });
});
