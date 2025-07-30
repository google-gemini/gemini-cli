/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatHelpContent } from './formatHelpContent.js';
import { CommandKind } from '../commands/types.js';

describe('formatHelpContent', () => {
  it('generates help content with all sections', () => {
    const commands = [
      {
        name: 'test',
        description: 'Test command',
        kind: CommandKind.BUILT_IN,
      },
      {
        name: 'help',
        description: 'Show help',
        kind: CommandKind.BUILT_IN,
      },
    ];

    const content = formatHelpContent(commands);

    // Should include all main sections
    expect(content).toContain('**Basics:**');
    expect(content).toContain('**Commands:**');
    expect(content).toContain('**Keyboard Shortcuts:**');

    // Should include basic instructions
    expect(content).toContain('**@**');
    expect(content).toContain('**!**');
    expect(content).toContain('Add context');
    expect(content).toContain('Shell mode');

    // Should include commands
    expect(content).toContain('**/test** - Test command');
    expect(content).toContain('**/help** - Show help');

    // Should include keyboard shortcuts
    expect(content).toContain('**Ctrl+L** - Clear the screen');
    expect(content).toContain('**Enter** - Send message');
  });

  it('includes commands with subcommands', () => {
    const commands = [
      {
        name: 'parent',
        description: 'Parent command',
        kind: CommandKind.BUILT_IN,
        subCommands: [
          { name: 'sub1', description: 'Subcommand 1' },
          { name: 'sub2', description: 'Subcommand 2' },
        ],
      },
    ];

    const content = formatHelpContent(commands);

    expect(content).toContain('**/parent** - Parent command');
    expect(content).toContain('**sub1** - Subcommand 1');
    expect(content).toContain('**sub2** - Subcommand 2');
  });

  it('filters out commands without descriptions', () => {
    const commands = [
      {
        name: 'visible',
        description: 'Visible command',
        kind: CommandKind.BUILT_IN,
      },
      {
        name: 'hidden',
        // No description
        kind: CommandKind.BUILT_IN,
      },
    ];

    const content = formatHelpContent(commands);

    expect(content).toContain('**/visible** - Visible command');
    expect(content).not.toContain('**/hidden**');
  });

  it('includes shell command reference', () => {
    const commands = [];
    const content = formatHelpContent(commands);

    expect(content).toContain('**!** - shell command');
  });

  it('includes platform-specific shortcuts', () => {
    const commands = [];
    const content = formatHelpContent(commands);

    if (process.platform === 'win32') {
      expect(content).toContain('**Ctrl+Enter** - New line');
    } else if (process.platform === 'linux') {
      expect(content).toContain('**Ctrl+J** - New line');
    } else {
      expect(content).toContain('**Ctrl+J** - New line');
    }

    if (process.platform === 'darwin') {
      expect(content).toContain(
        '**Ctrl+X / Meta+Enter** - Open input in external editor',
      );
    } else {
      expect(content).toContain('**Ctrl+X** - Open input in external editor');
    }
  });

  it('includes documentation reference', () => {
    const commands = [];
    const content = formatHelpContent(commands);

    expect(content).toContain('**docs/keyboard-shortcuts.md**');
  });

  it('returns a string with proper line structure', () => {
    const commands = [];
    const content = formatHelpContent(commands);

    // Should be a string
    expect(typeof content).toBe('string');

    // Should have multiple lines
    const lines = content.split('\n');
    expect(lines.length).toBeGreaterThan(10);

    // Should have empty lines for spacing
    expect(lines).toContain('');
  });
});
