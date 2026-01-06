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
  appendFile: vi.fn(),
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
    appendFile: mocks.appendFile,
    copyFile: mocks.copyFile,
  },
}));

vi.mock('node:os', () => ({
  homedir: mocks.homedir,
  platform: mocks.platform,
}));

import { terminalCapabilityManager } from './terminalCapabilityManager.js';

vi.mock('./terminalCapabilityManager.js', () => ({
  terminalCapabilityManager: {
    isKittyProtocolEnabled: vi.fn(),
  },
}));

describe('terminalSetup', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };

    // Default mocks
    mocks.homedir.mockReturnValue('/home/user');
    mocks.platform.mockReturnValue('darwin');
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.appendFile.mockResolvedValue(undefined);
    mocks.copyFile.mockResolvedValue(undefined);
    mocks.exec.mockImplementation((cmd, cb) => cb(null, { stdout: '' }));
    vi.mocked(terminalCapabilityManager.isKittyProtocolEnabled).mockReturnValue(
      false,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
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

    it('should detect Ghostty from env var', async () => {
      process.env['GHOSTTY_BIN_DIR'] = '/path/to/ghostty';
      const result = await terminalSetup();
      expect(result.message).toContain('Ghostty');
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
      expect(writtenContent).toHaveLength(2); // Shift+Enter and Ctrl+Enter
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

  describe('configureGhostty', () => {
    beforeEach(() => {
      process.env['GHOSTTY_BIN_DIR'] = '/path/to/ghostty';
    });

    it('should create new ghostty config if none exists', async () => {
      mocks.readFile.mockRejectedValue(new Error('ENOENT'));
      mocks.platform.mockReturnValue('darwin');
      mocks.homedir.mockReturnValue('/home/user');

      const result = await terminalSetup();

      expect(result.success).toBe(true);
      expect(result.message).toContain('word deletion (Alt+Backspace)');
      expect(mocks.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('com.mitchellh.ghostty'),
        { recursive: true },
      );
      // It uses fs.appendFile but implementation uses fs.writeFile in some versions
      // terminalSetup.ts uses fs.appendFile
    });

    it('should skip if macos-option-as-alt is already true', async () => {
      mocks.readFile.mockResolvedValue('macos-option-as-alt = true\n');

      const result = await terminalSetup();

      expect(result.success).toBe(true);
      expect(result.message).toContain('already configured');
    });

    it('should fail if macos-option-as-alt exists but is not true', async () => {
      mocks.readFile.mockResolvedValue('macos-option-as-alt = false\n');

      const result = await terminalSetup();

      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'already contains a macos-option-as-alt setting',
      );
    });
  });
});
