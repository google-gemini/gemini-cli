/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseSlashCommand, countArgs, validateArgs } from './commands.js';
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
    kind: CommandKind.USER_FILE,
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
});

describe('countArgs', () => {
  it('should return 0 for empty string', () => {
    expect(countArgs('')).toBe(0);
  });
  it('should return 0 for whitespace-only string', () => {
    expect(countArgs('   ')).toBe(0);
  });
  it('should return 1 for a single argument', () => {
    expect(countArgs('foo')).toBe(1);
  });
  it('should return 2 for two arguments', () => {
    expect(countArgs('foo bar')).toBe(2);
  });
  it('should handle multiple spaces between arguments', () => {
    expect(countArgs('foo   bar   baz')).toBe(3);
  });
});

describe('validateArgs', () => {
  it('should return undefined when argsSpec is undefined', () => {
    expect(validateArgs('foo', undefined, ['test'])).toBeUndefined();
  });
  it('should return undefined when args count is within range', () => {
    expect(validateArgs('', { max: 0 }, ['test'])).toBeUndefined();
    expect(validateArgs('foo', { min: 1, max: 1 }, ['test'])).toBeUndefined();
    expect(
      validateArgs('foo bar', { min: 1, max: 3 }, ['test']),
    ).toBeUndefined();
  });
  it('should error when no args given but min is 1', () => {
    expect(validateArgs('', { min: 1 }, ['test'])).toBe(
      '/test requires at least 1 argument.',
    );
  });
  it('should error when args below minimum', () => {
    expect(validateArgs('foo', { min: 3 }, ['test'])).toBe(
      '/test requires at least 3 arguments, but got 1.',
    );
  });
  it('should error when args exceed max of 0', () => {
    expect(validateArgs('foo', { max: 0 }, ['agents', 'list'])).toBe(
      '/agents list does not accept any arguments.',
    );
  });
  it('should error when args exceed max of 1', () => {
    expect(validateArgs('foo bar', { max: 1 }, ['test'])).toBe(
      '/test accepts at most 1 argument, but got 2.',
    );
  });
  it('should error when args exceed max (plural)', () => {
    expect(validateArgs('a b c d', { max: 2 }, ['test'])).toBe(
      '/test accepts at most 2 arguments, but got 4.',
    );
  });
  it('should append usage hint from description when present', () => {
    expect(
      validateArgs(
        '',
        { min: 1 },
        ['chat', 'save'],
        'Save a checkpoint. Usage: /chat save <tag>',
      ),
    ).toBe('/chat save requires at least 1 argument. Usage: /chat save <tag>');
  });
  it('should not append usage hint when description has no Usage:', () => {
    expect(validateArgs('', { min: 1 }, ['test'], 'Some description')).toBe(
      '/test requires at least 1 argument.',
    );
  });
});
