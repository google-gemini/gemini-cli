/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { terminalSetup, VSCODE_SHIFT_ENTER_SEQUENCE } from './terminalSetup.js';

// Mock dependencies
const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  copyFile: vi.fn(),
  homedir: vi.fn(),
  platform: vi.fn(),
  writeStream: {
    write: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('node:child_process', () => ({
  exec: mocks.exec,
  execFile: vi.fn(),
}));

vi.mock('node:fs', () => ({
  createWriteStream: () => mocks.writeStream,
  promises: {
    mkdir: mocks.mkdir,
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
    copyFile: mocks.copyFile,
  },
}));

vi.mock('node:os', () => ({
  homedir: mocks.homedir,
  platform: mocks.platform,
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: mocks.homedir,
  };
});

vi.mock('./terminalCapabilityManager.js', () => ({
  terminalCapabilityManager: {
    isKittyProtocolEnabled: vi.fn().mockReturnValue(false),
  },
}));

describe('terminalSetup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('TERM_PROGRAM', '');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    vi.stubEnv('VSCODE_GIT_ASKPASS_MAIN', '');
    vi.stubEnv('VSCODE_GIT_IPC_HANDLE', '');

    // Default mocks
    mocks.homedir.mockReturnValue('/home/user');
    mocks.platform.mockReturnValue('darwin');
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.copyFile.mockResolvedValue(undefined);
    mocks.exec.mockImplementation((cmd, cb) => cb(null, { stdout: '' }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('detectTerminal', () => {
    it('should detect VS Code from env var', async () => {
      process.env['TERM_PROGRAM'] = 'vscode';
      const result = await terminalSetup();
      expect(result.message).toContain('VS Code');
    });

    it('should detect Cursor from env var', async () => {
      process.env['CURSOR_TRACE_ID'] = 'some-id';
      const result = await terminalSetup();
      expect(result.message).toContain('Cursor');
    });

    it('should detect Windsurf from env var', async () => {
      process.env['VSCODE_GIT_ASKPASS_MAIN'] = '/path/to/windsurf/askpass';
      const result = await terminalSetup();
      expect(result.message).toContain('Windsurf');
    });

    it('should detect from parent process', async () => {
      mocks.platform.mockReturnValue('linux');
      mocks.exec.mockImplementation((cmd, cb) => {
        cb(null, { stdout: 'code\n' });
      });

      const result = await terminalSetup();
      expect(result.message).toContain('VS Code');
    });
  });

  describe('configureVSCodeStyle', () => {
    it('should create new keybindings file if none exists', async () => {
      process.env['TERM_PROGRAM'] = 'vscode';
      mocks.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await terminalSetup();

      expect(result.success).toBe(true);
      expect(mocks.writeFile).toHaveBeenCalled();

      const writtenContent = JSON.parse(mocks.writeFile.mock.calls[0][1]);
      expect(writtenContent).toMatchSnapshot();
    });

    it('should append to existing keybindings', async () => {
      process.env['TERM_PROGRAM'] = 'vscode';
      mocks.readFile.mockResolvedValue('[]');

      const result = await terminalSetup();

      expect(result.success).toBe(true);
      const writtenContent = JSON.parse(mocks.writeFile.mock.calls[0][1]);
      expect(writtenContent).toHaveLength(6); // Shift+Enter, Ctrl+Enter, Cmd+Z, Alt+Z, Shift+Cmd+Z, Shift+Alt+Z
    });

    it('should not modify if bindings already exist', async () => {
      process.env['TERM_PROGRAM'] = 'vscode';
      const existingBindings = [
        {
          key: 'shift+enter',
          command: 'workbench.action.terminal.sendSequence',
          args: { text: VSCODE_SHIFT_ENTER_SEQUENCE },
        },
        {
          key: 'ctrl+enter',
          command: 'workbench.action.terminal.sendSequence',
          args: { text: VSCODE_SHIFT_ENTER_SEQUENCE },
        },
        {
          key: 'cmd+z',
          command: 'workbench.action.terminal.sendSequence',
          args: { text: '\u001b[122;9u' },
        },
        {
          key: 'alt+z',
          command: 'workbench.action.terminal.sendSequence',
          args: { text: '\u001b[122;3u' },
        },
        {
          key: 'shift+cmd+z',
          command: 'workbench.action.terminal.sendSequence',
          args: { text: '\u001b[122;10u' },
        },
        {
          key: 'shift+alt+z',
          command: 'workbench.action.terminal.sendSequence',
          args: { text: '\u001b[122;4u' },
        },
      ];
      mocks.readFile.mockResolvedValue(JSON.stringify(existingBindings));

      const result = await terminalSetup();

      expect(result.success).toBe(true);
      expect(mocks.writeFile).not.toHaveBeenCalled();
    });

    it('should fail gracefully if json is invalid', async () => {
      process.env['TERM_PROGRAM'] = 'vscode';
      mocks.readFile.mockResolvedValue('{ invalid json');

      const result = await terminalSetup();

      expect(result.success).toBe(false);
      expect(result.message).toContain('invalid JSON');
    });

    it('should handle comments in JSON', async () => {
      process.env['TERM_PROGRAM'] = 'vscode';
      const jsonWithComments = '// This is a comment\n[]';
      mocks.readFile.mockResolvedValue(jsonWithComments);

      const result = await terminalSetup();

      expect(result.success).toBe(true);
      expect(mocks.writeFile).toHaveBeenCalled();
    });
  });
});
