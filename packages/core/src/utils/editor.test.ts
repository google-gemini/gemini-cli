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
  getCustomEditorFromEnv,
  detectBestEditor,
  type EditorType,
} from './editor.js';
import { execSync, spawn, spawnSync } from 'node:child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(() => ({ error: null, status: 0 })),
}));

const originalPlatform = process.platform;

describe('editor utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      { editor: 'vscode-insiders', commands: ['code-insiders'], win32Commands: ['code-insiders.cmd'] },
      { editor: 'pycharm', commands: ['pycharm'], win32Commands: ['pycharm.exe'] },
      { editor: 'sublime', commands: ['subl'], win32Commands: ['subl.exe'] },
      { editor: 'nano', commands: ['nano'], win32Commands: ['nano.exe'] },
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
            'autocmd BufWritePost * wqa',
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
    const guiEditors: EditorType[] = [
      'vscode',
      'vscodium',
      'windsurf',
      'cursor',
      'zed',
    ];

    for (const editor of guiEditors) {
      it(`should call spawn for ${editor}`, async () => {
        const mockSpawnOn = vi.fn((event, cb) => {
          if (event === 'close') {
            cb(0);
          }
        });
        (spawn as Mock).mockReturnValue({ on: mockSpawnOn });

        await openDiff('old.txt', 'new.txt', editor, () => {});
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor)!;
        expect(spawn).toHaveBeenCalledWith(
          diffCommand.command,
          diffCommand.args,
          {
            stdio: 'inherit',
          },
        );
        expect(mockSpawnOn).toHaveBeenCalledWith('close', expect.any(Function));
        expect(mockSpawnOn).toHaveBeenCalledWith('error', expect.any(Function));
      });

      it(`should reject if spawn for ${editor} fails`, async () => {
        const mockError = new Error('spawn error');
        const mockSpawnOn = vi.fn((event, cb) => {
          if (event === 'error') {
            cb(mockError);
          }
        });
        (spawn as Mock).mockReturnValue({ on: mockSpawnOn });

        await expect(
          openDiff('old.txt', 'new.txt', editor, () => {}),
        ).rejects.toThrow('spawn error');
      });

      it(`should reject if ${editor} exits with non-zero code`, async () => {
        const mockSpawnOn = vi.fn((event, cb) => {
          if (event === 'close') {
            cb(1);
          }
        });
        (spawn as Mock).mockReturnValue({ on: mockSpawnOn });

        await expect(
          openDiff('old.txt', 'new.txt', editor, () => {}),
        ).rejects.toThrow(`${editor} exited with code 1`);
      });
    }

    const terminalEditors: EditorType[] = ['vim', 'neovim', 'emacs'];

    for (const editor of terminalEditors) {
      it(`should call spawnSync for ${editor}`, async () => {
        await openDiff('old.txt', 'new.txt', editor, () => {});
        const diffCommand = getDiffCommand('old.txt', 'new.txt', editor)!;
        expect(spawnSync).toHaveBeenCalledWith(
          diffCommand.command,
          diffCommand.args,
          {
            stdio: 'inherit',
          },
        );
      });
    }

    it('should log an error if diff command is not available', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      // @ts-expect-error Testing unsupported editor
      await openDiff('old.txt', 'new.txt', 'foobar', () => {});
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'No diff tool available. Install a supported editor.',
      );
    });

    describe('onEditorClose callback', () => {
      const terminalEditors: EditorType[] = ['vim', 'neovim', 'emacs'];
      for (const editor of terminalEditors) {
        it(`should call onEditorClose for ${editor} on close`, async () => {
          const onEditorClose = vi.fn();
          await openDiff('old.txt', 'new.txt', editor, onEditorClose);
          expect(onEditorClose).toHaveBeenCalledTimes(1);
        });

        it(`should call onEditorClose for ${editor} on error`, async () => {
          const onEditorClose = vi.fn();
          const mockError = new Error('spawn error');
          (spawnSync as Mock).mockImplementation(() => {
            throw mockError;
          });

          await expect(
            openDiff('old.txt', 'new.txt', editor, onEditorClose),
          ).rejects.toThrow('spawn error');
          expect(onEditorClose).toHaveBeenCalledTimes(1);
        });
      }

      const guiEditors: EditorType[] = [
        'vscode',
        'vscodium',
        'windsurf',
        'cursor',
        'zed',
      ];
      for (const editor of guiEditors) {
        it(`should not call onEditorClose for ${editor}`, async () => {
          const onEditorClose = vi.fn();
          const mockSpawnOn = vi.fn((event, cb) => {
            if (event === 'close') {
              cb(0);
            }
          });
          (spawn as Mock).mockReturnValue({ on: mockSpawnOn });
          await openDiff('old.txt', 'new.txt', editor, onEditorClose);
          expect(onEditorClose).not.toHaveBeenCalled();
        });
      }
    });
  });

  describe('allowEditorTypeInSandbox', () => {
    it('should allow vim in sandbox mode', () => {
      vi.stubEnv('SANDBOX', 'sandbox');
      expect(allowEditorTypeInSandbox('vim')).toBe(true);
    });

    it('should allow vim when not in sandbox mode', () => {
      expect(allowEditorTypeInSandbox('vim')).toBe(true);
    });

    it('should allow emacs in sandbox mode', () => {
      vi.stubEnv('SANDBOX', 'sandbox');
      expect(allowEditorTypeInSandbox('emacs')).toBe(true);
    });

    it('should allow emacs when not in sandbox mode', () => {
      expect(allowEditorTypeInSandbox('emacs')).toBe(true);
    });

    it('should allow neovim in sandbox mode', () => {
      vi.stubEnv('SANDBOX', 'sandbox');
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
        vi.stubEnv('SANDBOX', 'sandbox');
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
      vi.stubEnv('SANDBOX', 'sandbox');
      expect(isEditorAvailable('vscode')).toBe(false);
    });

    it('should return true for vim when installed and in sandbox mode', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/vim'));
      vi.stubEnv('SANDBOX', 'sandbox');
      expect(isEditorAvailable('vim')).toBe(true);
    });

    it('should return true for emacs when installed and in sandbox mode', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/emacs'));
      vi.stubEnv('SANDBOX', 'sandbox');
      expect(isEditorAvailable('emacs')).toBe(true);
    });

    it('should return true for neovim when installed and in sandbox mode', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/nvim'));
      vi.stubEnv('SANDBOX', 'sandbox');
      expect(isEditorAvailable('neovim')).toBe(true);
    });
  });

  describe('getCustomEditorFromEnv', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should return null when no EDITOR or VISUAL is set', () => {
      expect(getCustomEditorFromEnv()).toBeNull();
    });

    it('should prioritize VISUAL over EDITOR', () => {
      vi.stubEnv('VISUAL', '/usr/bin/vim');
      vi.stubEnv('EDITOR', '/usr/bin/nano');
      expect(getCustomEditorFromEnv()).toBe('vim');
    });

    it('should use EDITOR when VISUAL is not set', () => {
      vi.stubEnv('EDITOR', '/usr/bin/emacs');
      expect(getCustomEditorFromEnv()).toBe('emacs');
    });

    it('should extract command name from full path', () => {
      vi.stubEnv('EDITOR', '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code');
      expect(getCustomEditorFromEnv()).toBe('code');
    });

    it('should handle Windows paths', () => {
      vi.stubEnv('EDITOR', 'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd');
      expect(getCustomEditorFromEnv()).toBe('code.cmd');
    });

    it('should handle commands with arguments', () => {
      vi.stubEnv('EDITOR', 'vim -n');
      expect(getCustomEditorFromEnv()).toBe('vim');
    });
  });

  describe('detectBestEditor', () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
      (execSync as Mock).mockImplementation(() => {
        throw new Error('Command not found');
      });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should prioritize custom editor from environment', () => {
      vi.stubEnv('EDITOR', '/usr/bin/custom-editor');
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/custom-editor'));
      expect(detectBestEditor()).toBe('custom');
    });

    it('should return cursor as first preference when available', () => {
      (execSync as Mock).mockImplementation((cmd: string) => {
        if (cmd.includes('cursor')) {
          return Buffer.from('/usr/bin/cursor');
        }
        throw new Error('Command not found');
      });
      expect(detectBestEditor()).toBe('cursor');
    });

    it('should fallback through preference order', () => {
      (execSync as Mock).mockImplementation((cmd: string) => {
        if (cmd.includes('nano')) {
          return Buffer.from('/usr/bin/nano');
        }
        throw new Error('Command not found');
      });
      expect(detectBestEditor()).toBe('nano');
    });

    it('should return null when no editors are available', () => {
      expect(detectBestEditor()).toBeNull();
    });

    it('should respect sandbox restrictions', () => {
      vi.stubEnv('SANDBOX', 'sandbox');
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/code'));

      // GUI editors should not be available in sandbox
      expect(detectBestEditor()).not.toBe('vscode');

      // Terminal editors should be available in sandbox
      (execSync as Mock).mockImplementation((cmd: string) => {
        if (cmd.includes('vim')) {
          return Buffer.from('/usr/bin/vim');
        }
        throw new Error('Command not found');
      });
      expect(detectBestEditor()).toBe('vim');
    });
  });

  describe('new editor types', () => {
    beforeEach(() => {
      (execSync as Mock).mockImplementation(() => {
        throw new Error('Command not found');
      });
    });

    it('should support vscode-insiders', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/code-insiders'));
      expect(checkHasEditorType('vscode-insiders')).toBe(true);
      expect(allowEditorTypeInSandbox('vscode-insiders')).toBe(false); // GUI editor
    });

    it('should support pycharm', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/pycharm'));
      expect(checkHasEditorType('pycharm')).toBe(true);
      expect(allowEditorTypeInSandbox('pycharm')).toBe(false); // GUI editor
    });

    it('should support sublime', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/subl'));
      expect(checkHasEditorType('sublime')).toBe(true);
      expect(allowEditorTypeInSandbox('sublime')).toBe(false); // GUI editor
    });

    it('should support nano', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('/usr/bin/nano'));
      expect(checkHasEditorType('nano')).toBe(true);
      expect(allowEditorTypeInSandbox('nano')).toBe(true); // Terminal editor
    });
  });
});
