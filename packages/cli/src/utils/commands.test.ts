/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseSlashCommand } from './commands.js';
import { CommandKind, type SlashCommand } from '../ui/commands/types.js';

// Mock command structure for testing
const mockCommands: readonly SlashCommand[] = [
  {
    name: 'help',
    description: 'Show help',
    action: async () => {},
    kind: CommandKind.BUILT_IN,
  },
  {
    name: 'commit',
    description: 'Commit changes',
    action: async () => {},
    kind: CommandKind.FILE,
  },
  {
    name: 'memory',
    description: 'Manage memory',
    altNames: ['mem'],
    subCommands: [
      {
        name: 'add',
        description: 'Add to memory',
        action: async () => {},
        kind: CommandKind.BUILT_IN,
      },
      {
        name: 'clear',
        description: 'Clear memory',
        altNames: ['c'],
        action: async () => {},
        kind: CommandKind.BUILT_IN,
      },
    ],
    kind: CommandKind.BUILT_IN,
  },
];

describe('parseSlashCommand', () => {
  it('should parse a simple command without arguments', () => {
    const result = parseSlashCommand('/help', mockCommands);
    expect(result.commandToExecute?.name).toBe('help');
    expect(result.args).toBe('');
    expect(result.canonicalPath).toEqual(['help']);
  });

  it('should parse a simple command with arguments', () => {
    const result = parseSlashCommand(
      '/commit -m "Initial commit"',
      mockCommands,
    );
    expect(result.commandToExecute?.name).toBe('commit');
    expect(result.args).toBe('-m "Initial commit"');
    expect(result.canonicalPath).toEqual(['commit']);
  });

  it('should parse a subcommand', () => {
    const result = parseSlashCommand('/memory add', mockCommands);
    expect(result.commandToExecute?.name).toBe('add');
    expect(result.args).toBe('');
    expect(result.canonicalPath).toEqual(['memory', 'add']);
  });

  it('should parse a subcommand with arguments', () => {
    const result = parseSlashCommand(
      '/memory add some important data',
      mockCommands,
    );
    expect(result.commandToExecute?.name).toBe('add');
    expect(result.args).toBe('some important data');
    expect(result.canonicalPath).toEqual(['memory', 'add']);
  });

  it('should handle a command alias', () => {
    const result = parseSlashCommand('/mem add some data', mockCommands);
    expect(result.commandToExecute?.name).toBe('add');
    expect(result.args).toBe('some data');
    expect(result.canonicalPath).toEqual(['memory', 'add']);
  });

  it('should handle a subcommand alias', () => {
    const result = parseSlashCommand('/memory c', mockCommands);
    expect(result.commandToExecute?.name).toBe('clear');
    expect(result.args).toBe('');
    expect(result.canonicalPath).toEqual(['memory', 'clear']);
  });

  it('should return undefined for an unknown command', () => {
    const result = parseSlashCommand('/unknown', mockCommands);
    expect(result.commandToExecute).toBeUndefined();
    expect(result.args).toBe('unknown');
    expect(result.canonicalPath).toEqual([]);
  });

  it('should return the parent command if subcommand is unknown', () => {
    const result = parseSlashCommand(
      '/memory unknownsub some args',
      mockCommands,
    );
    expect(result.commandToExecute?.name).toBe('memory');
    expect(result.args).toBe('unknownsub some args');
    expect(result.canonicalPath).toEqual(['memory']);
  });

  it('should handle extra whitespace', () => {
    const result = parseSlashCommand(
      '  /memory   add  some data  ',
      mockCommands,
    );
    expect(result.commandToExecute?.name).toBe('add');
    expect(result.args).toBe('some data');
    expect(result.canonicalPath).toEqual(['memory', 'add']);
  });

  it('should return undefined if query does not start with a slash', () => {
    const result = parseSlashCommand('help', mockCommands);
    expect(result.commandToExecute).toBeUndefined();
  });

  it('should handle an empty query', () => {
    const result = parseSlashCommand('', mockCommands);
    expect(result.commandToExecute).toBeUndefined();
  });

  it('should handle a query with only a slash', () => {
    const result = parseSlashCommand('/', mockCommands);
    expect(result.commandToExecute).toBeUndefined();
    expect(result.args).toBe('');
    expect(result.canonicalPath).toEqual([]);
  });

  describe('namespace-stripped (bare name) matching', () => {
    const namespacedCommands: readonly SlashCommand[] = [
      {
        name: 'help',
        description: 'Show help',
        action: async () => {},
        kind: CommandKind.BUILT_IN,
      },
      {
        name: 'workspace:my_command',
        namespace: 'workspace',
        description: 'A custom project command',
        action: async () => {},
        kind: CommandKind.FILE,
      },
      {
        name: 'user:my_other_command',
        namespace: 'user',
        description: 'A custom user command',
        action: async () => {},
        kind: CommandKind.FILE,
      },
    ];

    it('should match a namespaced command by bare name', () => {
      const result = parseSlashCommand(
        '/my_command San Francisco',
        namespacedCommands,
      );
      expect(result.commandToExecute?.name).toBe('workspace:my_command');
      expect(result.args).toBe('San Francisco');
      expect(result.canonicalPath).toEqual(['workspace:my_command']);
    });

    it('should match a user-namespaced command by bare name', () => {
      const result = parseSlashCommand(
        '/my_other_command hello',
        namespacedCommands,
      );
      expect(result.commandToExecute?.name).toBe('user:my_other_command');
      expect(result.args).toBe('hello');
    });

    it('should still match the full namespaced name exactly', () => {
      const result = parseSlashCommand(
        '/workspace:my_command args',
        namespacedCommands,
      );
      expect(result.commandToExecute?.name).toBe('workspace:my_command');
      expect(result.args).toBe('args');
    });

    it('should prefer exact name match over bare-name fallback', () => {
      const commands: readonly SlashCommand[] = [
        {
          name: 'deploy',
          description: 'Built-in deploy',
          action: async () => {},
          kind: CommandKind.BUILT_IN,
        },
        {
          name: 'workspace:deploy',
          namespace: 'workspace',
          description: 'Custom deploy',
          action: async () => {},
          kind: CommandKind.FILE,
        },
      ];
      const result = parseSlashCommand('/deploy', commands);
      expect(result.commandToExecute?.name).toBe('deploy');
    });

    it('should prefer workspace over user when both match by bare name', () => {
      const commands: readonly SlashCommand[] = [
        {
          name: 'user:review',
          namespace: 'user',
          description: 'User review command',
          action: async () => {},
          kind: CommandKind.FILE,
        },
        {
          name: 'workspace:review',
          namespace: 'workspace',
          description: 'Project review command',
          action: async () => {},
          kind: CommandKind.FILE,
        },
      ];
      const result = parseSlashCommand('/review some code', commands);
      expect(result.commandToExecute?.name).toBe('workspace:review');
      expect(result.args).toBe('some code');
    });

    it('should not match bare name for commands without a namespace', () => {
      const result = parseSlashCommand('/nonexistent', namespacedCommands);
      expect(result.commandToExecute).toBeUndefined();
    });
  });
});
