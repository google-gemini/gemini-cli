/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { skillsCommand } from './skills.js';

vi.mock('./skills/list.js', () => ({ listCommand: { command: 'list' } }));
vi.mock('./skills/enable.js', () => ({
  enableCommand: { command: 'enable <name>' },
}));
vi.mock('./skills/disable.js', () => ({
  disableCommand: { command: 'disable <name>' },
}));

vi.mock('../gemini.js', () => ({
  initializeOutputListenersAndFlush: vi.fn(),
}));

describe('skillsCommand', () => {
  it('should have correct command and aliases', () => {
    expect(skillsCommand.command).toBe('skills <command>');
    expect(skillsCommand.aliases).toEqual(['skill']);
    expect(skillsCommand.describe).toBe('Manage agent skills.');
  });

  it('should register all subcommands in builder', () => {
    const mockYargs = {
      middleware: vi.fn().mockReturnThis(),
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
      version: vi.fn().mockReturnThis(),
    };

    // @ts-expect-error - Mocking yargs
    skillsCommand.builder(mockYargs);

    expect(mockYargs.middleware).toHaveBeenCalled();
    expect(mockYargs.command).toHaveBeenCalledWith({ command: 'list' });
    expect(mockYargs.command).toHaveBeenCalledWith({
      command: 'enable <name>',
    });
    expect(mockYargs.command).toHaveBeenCalledWith({
      command: 'disable <name>',
    });
    expect(mockYargs.demandCommand).toHaveBeenCalledWith(1, expect.any(String));
    expect(mockYargs.version).toHaveBeenCalledWith(false);
  });

  it('should have a handler that does nothing', () => {
    // @ts-expect-error - Handler doesn't take arguments in this case
    expect(skillsCommand.handler()).toBeUndefined();
  });
});
