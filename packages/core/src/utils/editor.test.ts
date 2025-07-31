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
      commands: string[];
      win32Commands: string[];
    }> = [
      { editor: 'vscode', commands: ['code'], win32Commands: ['code.cmd'] },
      {
        editor: 'vscodium',
        commands: ['codium'],
        win32Commands: ['codium.cmd'],
      },
      {
        editor: 'windsurf',
        commands: ['windsurf'],
        win32Commands: ['windsurf'],
      },
      { editor: 'cursor', commands: ['cursor'], win32Commands: ['cursor'] },
      { editor: 'vim', commands: ['vim'], win32Commands: ['vim'] },
      { editor: 'neovim', commands: ['nvim'], win32Commands: ['nvim'] },
      { editor: 'zed', commands: ['zed', 'zeditor'], win32Commands: ['zed'] },
      { editor: 'emacs', commands: ['emacs'], win32Commands: ['emacs.exe'] },
    ];

    for (const { editor, commands, win32Commands } of testCases) {
      describe(`${editor}`, () => {
        // Non-windows tests
        it(`should return true if first command "${commands[0]}" exists on non-windows`, () => {
          Object.defineProperty(process, 'platform', { value: 'linux' });
          (execSync as Mock).mockReturnValue(
            Buffer.from(`/usr/bin/${commands[0]}`),
          );
          expect(checkHasEditorType(editor)).toBe(true);
          expect(execSync).toHaveBeenCalledWith(`command -v ${commands[0]}`, {
            stdio: 'ignore',
          });
        });

        if (commands.length > 1) {
          it(`should return true if first command doesn't exist but second command "${commands[1]}" exists on non-windows`, () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            (execSync as Mock)
              .mockImplementationOnce(() => {
                throw new Error(); // first command not found
              })
              .mockReturnValueOnce(Buffer.from(`/usr/bin/${commands[1]}`)); // second command found
            expect(checkHasEditorType(editor)).toBe(true);
            expect(execSync).toHaveBeenCalledTimes(2);
          });
        }

        it(`should return false if none of the commands exist on non-windows`, () => {
          Object.defineProperty(process, 'platform', { value: 'linux' });
          (execSync as Mock).mockImplementation(() => {
            throw new Error(); // all commands not found
          });
          expect(checkHasEditorType(editor)).toBe(false);
          expect(execSync).toHaveBeenCalledTimes(commands.length);
        });

        // Windows tests
        it(`should return true if first command "${win32Commands[0]}" exists on windows`, () => {
          Object.defineProperty(process, 'platform', { value: 'win32' });
          (execSync as Mock).mockReturnValue(
            Buffer.from(`C:\\Program Files\\...\\${win32Commands[0]}`),
          );
          expect(checkHasEditorType(editor)).toBe(true);
          expect(execSync).toHaveBeenCalledWith(
            `where.exe ${win32Commands[0]}`,
            {
              stdio: 'ignore',
            },
          );
        });

        if (win32Commands.length > 1) {
          it(`should return true if first command doesn't exist but second command "${win32Commands[1]}" exists on windows`, () => {
            Object.defineProperty(process, 'platform', { value: 'win32' });
            (execSync as Mock)
              .mockImplementationOnce(() => {
                throw new Error(); // first command not found
              })
              .mockReturnValueOnce(
                Buffer.from(`C:\\Program Files\\...\\${win32Commands[1]}`),
              ); // second command found
            expect(checkHasEditorType(editor)).toBe(true);
            expect(execSync).toHaveBeenCalledTimes(2);
          });
        }

        it(`should return false if none of the commands exist on windows`, () => {
          Object.defineProperty(process, 'platform', { value: 'win32' });
          (execSync as Mock).mockImplementation(() => {
            throw new Error(); // all commands not found
          });
          expect(checkHasEditorType(editor)).toBe(false);
          expect(execSync).toHaveBeenCalledTimes(win32Commands.length);
        });
      });
    }
  });

  describe('getDiffCommand', () => {
    const guiEditors: Array<{
      editor: EditorType;
      commands: string[];
      win32Commands: string[];
    }> = [
      { editor: 'vscode', commands: ['code'], win32Commands: ['code.cmd'] },
      {
        editor: 'vscodium',
        commands: ['codium'],
        win32Commands: ['codium.cmd'],
      },
      {
        editor: 'windsurf',
        commands: ['windsurf'],
        win32Commands: ['windsurf'],
      },
      { editor: 'cursor', commands: ['cursor'], win32Commands: ['cursor'] },
      { editor: 'zed', commands: ['zed', 'zeditor'], win32Commands: ['zed'] },
    ];

    for (const { editor, commands, win32Commands } of guiEditors) {
      // Non-windows tests
      it(`should use first command "${commands[0]}" when it exists on non-windows`, () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        (execSync as Mock).mockReturnValue(
          Buffer.from(`/usr/bin/${commands[0]}`),
        );
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
        expect(diffCommand).toEqual({
          command: commands[0],
          args: ['--wait', '--diff', 'old.txt', 'new.txt'],
        });
      });

      if (commands.length > 1) {
        it(`should use second command "${commands[1]}" when first doesn't exist on non-windows`, () => {
          Object.defineProperty(process, 'platform', { value: 'linux' });
          (execSync as Mock)
            .mockImplementationOnce(() => {
              throw new Error(); // first command not found
            })
            .mockReturnValueOnce(Buffer.from(`/usr/bin/${commands[1]}`)); // second command found

          const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
          expect(diffCommand).toEqual({
            command: commands[1],
            args: ['--wait', '--diff', 'old.txt', 'new.txt'],
          });
        });
      }

      it(`should fall back to last command "${commands[commands.length - 1]}" when none exist on non-windows`, () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        (execSync as Mock).mockImplementation(() => {
          throw new Error(); // all commands not found
        });

        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
        expect(diffCommand).toEqual({
          command: commands[commands.length - 1],
          args: ['--wait', '--diff', 'old.txt', 'new.txt'],
        });
      });

      // Windows tests
      it(`should use first command "${win32Commands[0]}" when it exists on windows`, () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        (execSync as Mock).mockReturnValue(
          Buffer.from(`C:\\Program Files\\...\\${win32Commands[0]}`),
        );
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
        expect(diffCommand).toEqual({
          command: win32Commands[0],
          args: ['--wait', '--diff', 'old.txt', 'new.txt'],
        });
      });

      if (win32Commands.length > 1) {
        it(`should use second command "${win32Commands[1]}" when first doesn't exist on windows`, () => {
          Object.defineProperty(process, 'platform', { value: 'win32' });
          (execSync as Mock)
            .mockImplementationOnce(() => {
              throw new Error(); // first command not found
            })
            .mockReturnValueOnce(
              Buffer.from(`C:\\Program Files\\...\\${win32Commands[1]}`),
            ); // second command found

          const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
          expect(diffCommand).toEqual({
            command: win32Commands[1],
            args: ['--wait', '--diff', 'old.txt', 'new.txt'],
          });
        });
      }

      it(`should fall back to last command "${win32Commands[win32Commands.length - 1]}" when none exist on windows`, () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        (execSync as Mock).mockImplementation(() => {
          throw new Error(); // all commands not found
        });

        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor);
        expect(diffCommand).toEqual({
          command: win32Commands[win32Commands.length - 1],
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

    it('should return the correct command for emacs', () => {
      const command = getDiffCommand('old.txt', 'new.txt', 'emacs');
      expect(command).toEqual({
        command: 'emacs',
        args: ['--eval', '(ediff "old.txt" "new.txt")'],
      });
    });

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

    const execSyncEditors: EditorType[] = ['vim', 'neovim', 'emacs'];
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

    it('should allow emacs in sandbox mode', () => {
      process.env.SANDBOX = 'sandbox';
      expect(allowEditorTypeInSandbox('emacs')).toBe(true);
    });

    it('should allow emacs when not in sandbox mode', () => {
      expect(allowEditorTypeInSandbox('emacs')).toBe(true);
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

    it('should return true for emacs when installed and in sandbox mode', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/emacs'));
      process.env.SANDBOX = 'sandbox';
      expect(isEditorAvailable('emacs')).toBe(true);
    });

    it('should return true for neovim when installed and in sandbox mode', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/nvim'));
      process.env.SANDBOX = 'sandbox';
      expect(isEditorAvailable('neovim')).toBe(true);
    });
  });
});
