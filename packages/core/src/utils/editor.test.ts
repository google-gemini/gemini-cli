/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import {
  checkHasEditorType,
  getDiffCommand,
  openDiff,
  allowEditorTypeInSandbox,
  isEditorAvailable,
  type EditorType,
} from './editor.js';
import { execSync, spawn } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

const originalPlatform = process.platform;

describe('editor utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SANDBOX;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SANDBOX;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
    });
  });

  describe('checkHasEditorType', () => {
    const testCases: Array<{
      editor: EditorType;
      command: string;
      win32Command: string;
    }> = [
      { editor: 'vscode', command: 'code', win32Command: 'code.cmd' },
      { editor: 'vscodium', command: 'codium', win32Command: 'codium.cmd' },
      { editor: 'windsurf', command: 'windsurf', win32Command: 'windsurf' },
      { editor: 'cursor', command: 'cursor', win32Command: 'cursor' },
      { editor: 'vim', command: 'vim', win32Command: 'vim' },
      { editor: 'neovim', command: 'nvim', win32Command: 'nvim' },
      { editor: 'zed', command: 'zed', win32Command: 'zed' },
    ];

    for (const { editor, command, win32Command } of testCases) {
      describe(`${editor}`, () => {
        it(`should return true if "${command}" command exists on non-windows`, () => {
          Object.defineProperty(process, 'platform', { value: 'linux' });
          (execSync as Mock).mockReturnValue(
            Buffer.from(`/usr/bin/${command}`),
          );
          expect(checkHasEditorType(editor)).toBe(true);
          expect(execSync).toHaveBeenCalledWith(`command -v ${command}`, {
            stdio: 'ignore',
          });
        });

        it(`should return false if "${command}" command does not exist on non-windows`, () => {
          Object.defineProperty(process, 'platform', { value: 'linux' });
          (execSync as Mock).mockImplementation(() => {
            throw new Error();
          });
          expect(checkHasEditorType(editor)).toBe(false);
        });

        it(`should return true if "${win32Command}" command exists on windows`, () => {
          Object.defineProperty(process, 'platform', { value: 'win32' });
          (execSync as Mock).mockReturnValue(
            Buffer.from(`C:\\Program Files\\...\\${win32Command}`),
          );
          expect(checkHasEditorType(editor)).toBe(true);
          expect(execSync).toHaveBeenCalledWith(`where.exe ${win32Command}`, {
            stdio: 'ignore',
          });
        });

        it(`should return false if "${win32Command}" command does not exist on windows`, () => {
          Object.defineProperty(process, 'platform', { value: 'win32' });
          (execSync as Mock).mockImplementation(() => {
            throw new Error();
          });
          expect(checkHasEditorType(editor)).toBe(false);
        });
      });
    }
  });

  describe('getDiffCommand', () => {
    const guiEditors: Array<{
      editor: EditorType;
      command: string;
      win32Command: string;
    }> = [
      { editor: 'vscode', command: 'code', win32Command: 'code.cmd' },
      { editor: 'vscodium', command: 'codium', win32Command: 'codium.cmd' },
      { editor: 'windsurf', command: 'windsurf', win32Command: 'windsurf' },
      { editor: 'cursor', command: 'cursor', win32Command: 'cursor' },
      { editor: 'zed', command: 'zed', win32Command: 'zed' },
    ];

    for (const { editor, command, win32Command } of guiEditors) {
      it(`should return the correct command for ${editor} on non-windows`, () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
        expect(diffCommand).toEqual({
          command,
          args: ['--wait', '--diff', 'old.txt', 'new.txt'],
        });
      });

      it(`should return the correct command for ${editor} on windows`, () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
        expect(diffCommand).toEqual({
          command: win32Command,
          args: ['--wait', '--diff', 'old.txt', 'new.txt'],
        });
      });
    }

    const terminalEditors: Array<{
      editor: EditorType;
      command: string;
    }> = [
      { editor: 'vim', command: 'vim' },
      { editor: 'neovim', command: 'nvim' },
    ];

    for (const { editor, command } of terminalEditors) {
      it(`should return the correct command for ${editor}`, () => {
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
        expect(diffCommand).toEqual({
          command,
          args: [
            '-d',
            '-i',
            'NONE',
            '-c',
            'wincmd h | set readonly | wincmd l',
            '-c',
            'highlight DiffAdd cterm=bold ctermbg=22 guibg=#005f00 | highlight DiffChange cterm=bold ctermbg=24 guibg=#005f87 | highlight DiffText ctermbg=21 guibg=#0000af | highlight DiffDelete ctermbg=52 guibg=#5f0000',
            '-c',
            'set showtabline=2 | set tabline=[Instructions]\\ :wqa(save\\ &\\ quit)\\ \\|\\ i/esc(toggle\\ edit\\ mode)',
            '-c',
            'wincmd h | setlocal statusline=OLD\\ FILE',
            '-c',
            'wincmd l | setlocal statusline=%#StatusBold#NEW\\ FILE\\ :wqa(save\\ &\\ quit)\\ \\|\\ i/esc(toggle\\ edit\\ mode)',
            '-c',
            'autocmd WinClosed * wqa',
            'old.txt',
            'new.txt',
          ],
        });
      });
    }

    it('should return null for an unsupported editor', () => {
      // @ts-expect-error Testing unsupported editor
      const command = getDiffCommand('old.txt', 'new.txt', 'foobar');
      expect(command).toBeNull();
    });
  });

  describe('openDiff', () => {
    const spawnEditors: EditorType[] = [
      'vscode',
      'vscodium',
      'windsurf',
      'cursor',
      'zed',
    ];
    for (const editor of spawnEditors) {
      it(`should call spawn for ${editor}`, async () => {
        const mockSpawn = {
          on: vi.fn((event, cb) => {
            if (event === 'close') {
              cb(0);
            }
          }),
        };
        (spawn as Mock).mockReturnValue(mockSpawn);
        await openDiff('old.txt', 'new.txt', editor);
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor)!;
        expect(spawn).toHaveBeenCalledWith(
          diffCommand.command,
          diffCommand.args,
          {
            stdio: 'inherit',
            shell: true,
          },
        );
        expect(mockSpawn.on).toHaveBeenCalledWith(
          'close',
          expect.any(Function),
        );
        expect(mockSpawn.on).toHaveBeenCalledWith(
          'error',
          expect.any(Function),
        );
      });

      it(`should reject if spawn for ${editor} fails`, async () => {
        const mockError = new Error('spawn error');
        const mockSpawn = {
          on: vi.fn((event, cb) => {
            if (event === 'error') {
              cb(mockError);
            }
          }),
        };
        (spawn as Mock).mockReturnValue(mockSpawn);
        await expect(openDiff('old.txt', 'new.txt', editor)).rejects.toThrow(
          'spawn error',
        );
      });

      it(`should reject if ${editor} exits with non-zero code`, async () => {
        const mockSpawn = {
          on: vi.fn((event, cb) => {
            if (event === 'close') {
              cb(1);
            }
          }),
        };
        (spawn as Mock).mockReturnValue(mockSpawn);
        await expect(openDiff('old.txt', 'new.txt', editor)).rejects.toThrow(
          `${editor} exited with code 1`,
        );
      });
    }

    const execSyncEditors: EditorType[] = ['vim', 'neovim'];
    for (const editor of execSyncEditors) {
      it(`should call execSync for ${editor} on non-windows`, async () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        await openDiff('old.txt', 'new.txt', editor);
        expect(execSync).toHaveBeenCalledTimes(1);
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor)!;
        const expectedCommand = `${
          diffCommand.command
        } ${diffCommand.args.map((arg) => `"${arg}"`).join(' ')}`;
        expect(execSync).toHaveBeenCalledWith(expectedCommand, {
          stdio: 'inherit',
          encoding: 'utf8',
        });
      });

      it(`should call execSync for ${editor} on windows`, async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        await openDiff('old.txt', 'new.txt', editor);
        expect(execSync).toHaveBeenCalledTimes(1);
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor)!;
        const expectedCommand = `${diffCommand.command} ${diffCommand.args.join(
          ' ',
        )}`;
        expect(execSync).toHaveBeenCalledWith(expectedCommand, {
          stdio: 'inherit',
          encoding: 'utf8',
        });
      });
    }

    it('should log an error if diff command is not available', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      // @ts-expect-error Testing unsupported editor
      await openDiff('old.txt', 'new.txt', 'foobar');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'No diff tool available. Install a supported editor.',
      );
    });
  });

  describe('allowEditorTypeInSandbox', () => {
    it('should allow vim in sandbox mode', () => {
      process.env.SANDBOX = 'sandbox';
      expect(allowEditorTypeInSandbox('vim')).toBe(true);
    });

    it('should allow vim when not in sandbox mode', () => {
      expect(allowEditorTypeInSandbox('vim')).toBe(true);
    });

    it('should allow neovim in sandbox mode', () => {
      process.env.SANDBOX = 'sandbox';
      expect(allowEditorTypeInSandbox('neovim')).toBe(true);
    });

    it('should allow neovim when not in sandbox mode', () => {
      expect(allowEditorTypeInSandbox('neovim')).toBe(true);
    });

    const guiEditors: EditorType[] = [
      'vscode',
      'vscodium',
      'windsurf',
      'cursor',
      'zed',
    ];
    for (const editor of guiEditors) {
      it(`should not allow ${editor} in sandbox mode`, () => {
        process.env.SANDBOX = 'sandbox';
        expect(allowEditorTypeInSandbox(editor)).toBe(false);
      });

      it(`should allow ${editor} when not in sandbox mode`, () => {
        expect(allowEditorTypeInSandbox(editor)).toBe(true);
      });
    }
  });

  describe('isEditorAvailable', () => {
    it('should return false for undefined editor', () => {
      expect(isEditorAvailable(undefined)).toBe(false);
    });

    it('should return false for empty string editor', () => {
      expect(isEditorAvailable('')).toBe(false);
    });

    it('should return false for invalid editor type', () => {
      expect(isEditorAvailable('invalid-editor')).toBe(false);
    });

    it('should return true for vscode when installed and not in sandbox mode', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/code'));
      expect(isEditorAvailable('vscode')).toBe(true);
    });

    it('should return false for vscode when not installed and not in sandbox mode', () => {
      (execSync as Mock).mockImplementation(() => {
        throw new Error();
      });
      expect(isEditorAvailable('vscode')).toBe(false);
    });

    it('should return false for vscode when installed and in sandbox mode', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/code'));
      process.env.SANDBOX = 'sandbox';
      expect(isEditorAvailable('vscode')).toBe(false);
    });

    it('should return true for vim when installed and in sandbox mode', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/vim'));
      process.env.SANDBOX = 'sandbox';
      expect(isEditorAvailable('vim')).toBe(true);
    });

    it('should return true for neovim when installed and in sandbox mode', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/nvim'));
      process.env.SANDBOX = 'sandbox';
      expect(isEditorAvailable('neovim')).toBe(true);
    });
  });
});
