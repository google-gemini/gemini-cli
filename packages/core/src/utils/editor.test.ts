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
import { execSync, spawn, spawnSync } from 'node:child_process';
import { debugLogger } from './debugLogger.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(() => ({ error: null, status: 0 })),
}));

const originalPlatform = process.platform;

describe('editor utils', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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
      {
        editor: 'antigravity',
        commands: ['agy', 'antigravity'],
        win32Commands: ['agy.cmd', 'antigravity.cmd'],
      },
      { editor: 'hx', commands: ['hx'], win32Commands: ['hx'] },
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
      {
        editor: 'antigravity',
        commands: ['agy', 'antigravity'],
        win32Commands: ['agy.cmd', 'antigravity.cmd'],
      },
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
            'autocmd BufWritePost * wqa',
            'old.txt',
            'new.txt',
          ],
        });
      });
    }

    it('should return the correct command for emacs with escaped paths', () => {
      const command = getDiffCommand(
        'old file "quote".txt',
        'new file \\back\\slash.txt',
        'emacs',
      );
      expect(command).toEqual({
        command: 'emacs',
        args: [
          '--eval',
          '(ediff "old file \\"quote\\".txt" "new file \\\\back\\\\slash.txt")',
        ],
      });
    });

    it('should return the correct command for helix', () => {
      const diffCommand = getDiffCommand('old.txt', 'new.txt', 'hx');
      expect(diffCommand).toEqual({
        command: 'hx',
        args: ['--vsplit', '--', 'old.txt', 'new.txt'],
      });
    });

    it('should return null for an unsupported editor', () => {
      // @ts-expect-error - testing invalid editor
      const diffCommand = getDiffCommand('old.txt', 'new.txt', 'invalid');
      expect(diffCommand).toBeNull();
    });
  });

  describe('openDiff', () => {
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
      { editor: 'antigravity', command: 'agy', win32Command: 'agy.cmd' },
    ];

    for (const { editor, command, win32Command } of guiEditors) {
      describe(`${editor}`, () => {
        it(`should call spawn for ${editor}`, async () => {
          (execSync as Mock).mockReturnValue(
            Buffer.from(`/usr/bin/${command}`),
          );
          const mockChild = {
            on: vi.fn((event, cb) => {
              if (event === 'close') setTimeout(() => cb(0), 0);
            }),
            unref: vi.fn(),
          };
          (spawn as Mock).mockReturnValue(mockChild);
          await openDiff('old.txt', 'new.txt', editor);
          const isWin32 = process.platform === 'win32';
          expect(spawn).toHaveBeenCalledWith(
            isWin32 ? win32Command : command,
            ['--wait', '--diff', 'old.txt', 'new.txt'],
            {
              stdio: 'inherit',
              shell: isWin32,
            },
          );
        });

        it(`should reject if spawn for ${editor} fails`, async () => {
          (execSync as Mock).mockReturnValue(
            Buffer.from(`/usr/bin/${command}`),
          );
          const mockChild = {
            on: vi.fn((event, cb) => {
              if (event === 'error') cb(new Error('spawn failed'));
            }),
            unref: vi.fn(),
          };
          (spawn as Mock).mockReturnValue(mockChild);

          await expect(openDiff('old.txt', 'new.txt', editor)).rejects.toThrow(
            'spawn failed',
          );
        });

        it(`should reject if ${editor} exits with non-zero code`, async () => {
          (execSync as Mock).mockReturnValue(
            Buffer.from(`/usr/bin/${command}`),
          );
          const mockChild = {
            on: vi.fn((event, cb) => {
              if (event === 'close') cb(1);
            }),
            unref: vi.fn(),
          };
          (spawn as Mock).mockReturnValue(mockChild);

          await expect(openDiff('old.txt', 'new.txt', editor)).rejects.toThrow(
            `${editor} exited with code 1`,
          );
        });
      });
    }

    it('should call spawnSync for vim', async () => {
      await openDiff('old.txt', 'new.txt', 'vim');
      expect(spawnSync).toHaveBeenCalledWith(
        'vim',
        [
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
          'autocmd BufWritePost * wqa',
          'old.txt',
          'new.txt',
        ],
        {
          stdio: 'inherit',
        },
      );
    });

    it('should call spawnSync for neovim', async () => {
      await openDiff('old.txt', 'new.txt', 'neovim');
      expect(spawnSync).toHaveBeenCalledWith(
        'nvim',
        [
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
          'autocmd BufWritePost * wqa',
          'old.txt',
          'new.txt',
        ],
        {
          stdio: 'inherit',
        },
      );
    });

    it('should call spawnSync for emacs', async () => {
      await openDiff('old.txt', 'new.txt', 'emacs');
      expect(spawnSync).toHaveBeenCalledWith(
        'emacs',
        ['--eval', '(ediff "old.txt" "new.txt")'],
        {
          stdio: 'inherit',
        },
      );
    });

    it('should call spawnSync for hx', async () => {
      await openDiff('old.txt', 'new.txt', 'hx');
      expect(spawnSync).toHaveBeenCalledWith(
        'hx',
        ['--vsplit', '--', 'old.txt', 'new.txt'],
        {
          stdio: 'inherit',
        },
      );
    });

    it('should log an error if diff command is not available', async () => {
      const loggerSpy = vi.spyOn(debugLogger, 'error');
      // @ts-expect-error - testing invalid editor
      await openDiff('old.txt', 'new.txt', 'invalid');
      expect(loggerSpy).toHaveBeenCalledWith(
        'No diff tool available. Install a supported editor.',
      );
    });
  });

  describe('allowEditorTypeInSandbox', () => {
    it('should allow vim in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      expect(allowEditorTypeInSandbox('vim')).toBe(true);
    });

    it('should allow vim when not in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'false');
      expect(allowEditorTypeInSandbox('vim')).toBe(true);
    });

    it('should allow emacs in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      expect(allowEditorTypeInSandbox('emacs')).toBe(true);
    });

    it('should allow emacs when not in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'false');
      expect(allowEditorTypeInSandbox('emacs')).toBe(true);
    });

    it('should allow neovim in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      expect(allowEditorTypeInSandbox('neovim')).toBe(true);
    });

    it('should allow neovim when not in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'false');
      expect(allowEditorTypeInSandbox('neovim')).toBe(true);
    });

    it('should allow hx in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      expect(allowEditorTypeInSandbox('hx')).toBe(true);
    });

    it('should allow hx when not in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'false');
      expect(allowEditorTypeInSandbox('hx')).toBe(true);
    });

    it('should not allow vscode in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      expect(allowEditorTypeInSandbox('vscode')).toBe(false);
    });

    it('should allow vscode when not in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'false');
      expect(allowEditorTypeInSandbox('vscode')).toBe(true);
    });

    it('should not allow vscodium in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      expect(allowEditorTypeInSandbox('vscodium')).toBe(false);
    });

    it('should allow vscodium when not in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'false');
      expect(allowEditorTypeInSandbox('vscodium')).toBe(true);
    });

    it('should not allow windsurf in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      expect(allowEditorTypeInSandbox('windsurf')).toBe(false);
    });

    it('should allow windsurf when not in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'false');
      expect(allowEditorTypeInSandbox('windsurf')).toBe(true);
    });

    it('should not allow cursor in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      expect(allowEditorTypeInSandbox('cursor')).toBe(false);
    });

    it('should allow cursor when not in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'false');
      expect(allowEditorTypeInSandbox('cursor')).toBe(true);
    });

    it('should not allow zed in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      expect(allowEditorTypeInSandbox('zed')).toBe(false);
    });

    it('should allow zed when not in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'false');
      expect(allowEditorTypeInSandbox('zed')).toBe(true);
    });
  });

  describe('isEditorAvailable', () => {
    it('should return false for undefined editor', () => {
      expect(isEditorAvailable(undefined)).toBe(false);
    });

    it('should return false for empty string editor', () => {
      expect(isEditorAvailable('')).toBe(false);
    });

    it('should return false for invalid editor type', () => {
      expect(isEditorAvailable('invalid')).toBe(false);
    });

    it('should return true for vscode when installed and not in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'false');
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/code'));
      expect(isEditorAvailable('vscode')).toBe(true);
    });

    it('should return false for vscode when not installed and not in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'false');
      (execSync as Mock).mockImplementation(() => {
        throw new Error();
      });
      expect(isEditorAvailable('vscode')).toBe(false);
    });

    it('should return false for vscode when installed and in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/code'));
      expect(isEditorAvailable('vscode')).toBe(false);
    });

    it('should return true for vim when installed and in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/vim'));
      expect(isEditorAvailable('vim')).toBe(true);
    });

    it('should return true for emacs when installed and in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/emacs'));
      expect(isEditorAvailable('emacs')).toBe(true);
    });

    it('should return true for hx when installed and in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/hx'));
      expect(isEditorAvailable('hx')).toBe(true);
    });

    it('should return true for neovim when installed and in sandbox mode', () => {
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/nvim'));
      expect(isEditorAvailable('neovim')).toBe(true);
    });
  });
});
