/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { profilesCommand } from './profiles.js';

// Mock subcommands
vi.mock('./profiles/list.js', () => ({ listCommand: { command: 'list' } }));
vi.mock('./profiles/enable.js', () => ({
  enableCommand: { command: 'enable' },
}));
vi.mock('./profiles/disable.js', () => ({
  disableCommand: { command: 'disable' },
}));
vi.mock('./profiles/uninstall.js', () => ({
  uninstallCommand: { command: 'uninstall' },
}));
vi.mock('./profiles/install.js', () => ({
  installCommand: { command: 'install' },
}));
vi.mock('./profiles/link.js', () => ({
  linkCommand: { command: 'link' },
}));

// Mock gemini.js
vi.mock('../gemini.js', () => ({
  initializeOutputListenersAndFlush: vi.fn(),
}));

describe('profilesCommand', () => {
  it('should have correct command and description', () => {
    expect(profilesCommand.command).toBe('profiles <command>');
    expect(profilesCommand.describe).toBe('Manage Gemini CLI profiles.');
  });

  it('should register all subcommands in builder', () => {
    const mockYargs = {
      middleware: vi.fn().mockReturnThis(),
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
      version: vi.fn().mockReturnThis(),
    };

    // @ts-expect-error - Mocking yargs
    profilesCommand.builder(mockYargs);

    expect(mockYargs.middleware).toHaveBeenCalled();
    expect(mockYargs.command).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'list' }),
    );
    expect(mockYargs.command).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'enable' }),
    );
    expect(mockYargs.command).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'disable' }),
    );
    expect(mockYargs.command).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'uninstall' }),
    );
    expect(mockYargs.command).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'install' }),
    );
    expect(mockYargs.command).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'link' }),
    );
    expect(mockYargs.demandCommand).toHaveBeenCalledWith(1, expect.any(String));
    expect(mockYargs.version).toHaveBeenCalledWith(false);
  });
});
