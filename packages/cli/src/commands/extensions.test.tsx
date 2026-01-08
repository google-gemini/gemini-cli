/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { extensionsCommand } from './extensions.js';

// Mock subcommands
vi.mock('./extensions/install.js', () => ({
  installCommand: { command: 'install' },
}));
vi.mock('./extensions/uninstall.js', () => ({
  uninstallCommand: { command: 'uninstall' },
}));
vi.mock('./extensions/list.js', () => ({ listCommand: { command: 'list' } }));
vi.mock('./extensions/update.js', () => ({
  updateCommand: { command: 'update' },
}));
vi.mock('./extensions/disable.js', () => ({
  disableCommand: { command: 'disable' },
}));
vi.mock('./extensions/enable.js', () => ({
  enableCommand: { command: 'enable' },
}));
vi.mock('./extensions/link.js', () => ({ linkCommand: { command: 'link' } }));
vi.mock('./extensions/new.js', () => ({ newCommand: { command: 'new' } }));
vi.mock('./extensions/validate.js', () => ({
  validateCommand: { command: 'validate' },
}));

// Mock gemini.js
vi.mock('../gemini.js', () => ({
  initializeOutputListenersAndFlush: vi.fn(),
}));

describe('extensionsCommand', () => {
  it('should have correct command and aliases', () => {
    expect(extensionsCommand.command).toBe('extensions <command>');
    expect(extensionsCommand.aliases).toEqual(['extension']);
    expect(extensionsCommand.describe).toBe('Manage Gemini CLI extensions.');
  });

  it('should register all subcommands in builder', () => {
    const mockYargs = {
      middleware: vi.fn().mockReturnThis(),
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
      version: vi.fn().mockReturnThis(),
    };

    // @ts-expect-error - Mocking yargs
    extensionsCommand.builder(mockYargs);

    expect(mockYargs.middleware).toHaveBeenCalled();
    expect(mockYargs.command).toHaveBeenCalledWith({ command: 'install' });
    expect(mockYargs.command).toHaveBeenCalledWith({ command: 'uninstall' });
    expect(mockYargs.command).toHaveBeenCalledWith({ command: 'list' });
    expect(mockYargs.command).toHaveBeenCalledWith({ command: 'update' });
    expect(mockYargs.command).toHaveBeenCalledWith({ command: 'disable' });
    expect(mockYargs.command).toHaveBeenCalledWith({ command: 'enable' });
    expect(mockYargs.command).toHaveBeenCalledWith({ command: 'link' });
    expect(mockYargs.command).toHaveBeenCalledWith({ command: 'new' });
    expect(mockYargs.command).toHaveBeenCalledWith({ command: 'validate' });
    expect(mockYargs.demandCommand).toHaveBeenCalledWith(1, expect.any(String));
    expect(mockYargs.version).toHaveBeenCalledWith(false);
  });

  it('should have a handler that does nothing', () => {
    // @ts-expect-error - Handler doesn't take arguments in this case
    expect(extensionsCommand.handler()).toBeUndefined();
  });
});
