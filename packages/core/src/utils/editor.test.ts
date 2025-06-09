/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { checkHasEditor, getDiffCommand, openDiff } from './editor.js';
import { execSync, spawn } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

describe('checkHasEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true for vscode if "code" command exists', () => {
    (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/code'));
    expect(checkHasEditor('vscode')).toBe(true);
    const expectedCommand =
      process.platform === 'win32' ? 'where.exe code.cmd' : 'command -v code';
    expect(execSync).toHaveBeenCalledWith(expectedCommand, {
      stdio: 'ignore',
    });
  });

  it('should return false for vscode if "code" command does not exist', () => {
    (execSync as Mock).mockImplementation(() => {
      throw new Error();
    });
    expect(checkHasEditor('vscode')).toBe(false);
  });

  it('should return true for vim if "vim" command exists', () => {
    (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/vim'));
    expect(checkHasEditor('vim')).toBe(true);
    const expectedCommand =
      process.platform === 'win32' ? 'where.exe vim' : 'command -v vim';
    expect(execSync).toHaveBeenCalledWith(expectedCommand, {
      stdio: 'ignore',
    });
  });

  it('should return false for vim if "vim" command does not exist', () => {
    (execSync as Mock).mockImplementation(() => {
      throw new Error();
    });
    expect(checkHasEditor('vim')).toBe(false);
  });
});

describe('getDiffCommand', () => {
  it('should return the correct command for vscode', () => {
    const command = getDiffCommand('old.txt', 'new.txt', 'vscode');
    expect(command).toEqual({
      command: 'code',
      args: ['--wait', '--diff', 'old.txt', 'new.txt'],
    });
  });

  it('should return the correct command for vim', () => {
    const command = getDiffCommand('old.txt', 'new.txt', 'vim');
    expect(command?.command).toBe('vim');
    expect(command?.args).toContain('old.txt');
    expect(command?.args).toContain('new.txt');
  });

  it('should return null for an unsupported editor', () => {
    // @ts-expect-error Testing unsupported editor
    const command = getDiffCommand('old.txt', 'new.txt', 'nano');
    expect(command).toBeNull();
  });
});

describe('openDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call spawn for vscode', async () => {
    const mockSpawn = {
      on: vi.fn((event, cb) => {
        if (event === 'close') {
          cb(0);
        }
      }),
    };
    (spawn as Mock).mockReturnValue(mockSpawn);
    await openDiff('old.txt', 'new.txt', 'vscode');
    expect(spawn).toHaveBeenCalledWith(
      'code',
      ['--wait', '--diff', 'old.txt', 'new.txt'],
      { stdio: 'inherit' },
    );
    expect(mockSpawn.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(mockSpawn.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should call execSync for vim', async () => {
    await openDiff('old.txt', 'new.txt', 'vim');
    expect(execSync).toHaveBeenCalled();
    const command = (execSync as Mock).mock.calls[0][0];
    expect(command).toContain('vim');
    expect(command).toContain('old.txt');
    expect(command).toContain('new.txt');
  });

  it('should handle spawn error for vscode', async () => {
    const mockSpawn = {
      on: vi.fn((event, cb) => {
        if (event === 'error') {
          cb(new Error('spawn error'));
        }
      }),
    };
    (spawn as Mock).mockReturnValue(mockSpawn);
    await expect(openDiff('old.txt', 'new.txt', 'vscode')).rejects.toThrow(
      'spawn error',
    );
  });
});
