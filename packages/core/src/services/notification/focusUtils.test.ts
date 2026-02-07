/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import process from 'node:process';
import { exec } from 'node:child_process';
import { isTerminalAppFocused } from './focusUtils.js';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

describe('focusUtils', () => {
  const mockExec = exec as unknown as ReturnType<typeof vi.fn>;
  const originalPlatform = process.platform;
  const originalEnvTermProgram = process.env['TERM_PROGRAM'];

  const originalEnvTerm = process.env['TERM'];

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    delete process.env['TERM_PROGRAM'];
    delete process.env['TERM'];
    mockExec.mockImplementation((_cmd, _opts, callback) => {
      const cb = typeof _opts === 'function' ? _opts : callback;
      cb(null, { stdout: '', stderr: '' });
    });
  });

  afterEach(() => {
    process.env['TERM_PROGRAM'] = originalEnvTermProgram;
    process.env['TERM'] = originalEnvTerm;
    vi.restoreAllMocks();
  });

  describe('isTerminalAppFocused', () => {
    it('should return null if neither TERM_PROGRAM nor TERM is set', async () => {
      delete process.env['TERM_PROGRAM'];
      delete process.env['TERM'];
      expect(await isTerminalAppFocused()).toBeNull();
    });

    it('should fallback to TERM if TERM_PROGRAM is missing (Kitty)', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      delete process.env['TERM_PROGRAM'];
      process.env['TERM'] = 'xterm-kitty';
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, { stdout: 'kitty\n', stderr: '' });
      });

      expect(await isTerminalAppFocused()).toBe(true);
    });

    it('should fallback to TERM if TERM_PROGRAM is missing (Alacritty)', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      delete process.env['TERM_PROGRAM'];
      process.env['TERM'] = 'alacritty';
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, { stdout: 'Alacritty\n', stderr: '' });
      });

      expect(await isTerminalAppFocused()).toBe(true);
    });

    it('should return true on macOS for iTerm2', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'iTerm.app';
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, { stdout: 'iTerm2\n', stderr: '' });
      });

      expect(await isTerminalAppFocused()).toBe(true);
    });

    it('should return true on macOS for VS Code', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'vscode';
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, { stdout: 'Code\n', stderr: '' });
      });

      expect(await isTerminalAppFocused()).toBe(true);
    });

    it('should return true on macOS for WezTerm', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'WezTerm';
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, { stdout: 'wezterm-gui\n', stderr: '' });
      });

      expect(await isTerminalAppFocused()).toBe(true);
    });

    it('should return true on macOS if terminal is frontmost (Apple_Terminal)', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'Apple_Terminal';
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, { stdout: 'Terminal\n', stderr: '' });
      });

      expect(await isTerminalAppFocused()).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(
        "lsappinfo info -only Name `lsappinfo front` | cut -d '\"' -f4",
        expect.any(Function),
      );
    });

    it('should return false on macOS if terminal is NOT frontmost (Apple_Terminal)', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'Apple_Terminal';
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, { stdout: 'OtherApp\n', stderr: '' });
      });

      expect(await isTerminalAppFocused()).toBe(false);
    });

    it('should return true on macOS for Warp', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'WarpTerminal';
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, { stdout: 'Warp\n', stderr: '' });
      });

      expect(await isTerminalAppFocused()).toBe(true);
    });

    it('should return true on Windows if terminal is frontmost', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env['TERM_PROGRAM'] = 'Apple_Terminal';
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, { stdout: 'Terminal\n', stderr: '' });
      });

      expect(await isTerminalAppFocused()).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('powershell'),
        expect.any(Function),
      );
    });

    it('should return true on Linux if terminal is frontmost', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env['TERM_PROGRAM'] = 'Apple_Terminal';
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, { stdout: 'Terminal\n', stderr: '' });
      });

      expect(await isTerminalAppFocused()).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(
        "xdotool getwindowfocus getwindowname 2>/dev/null || xprop -id $(xdotool getwindowfocus) WM_CLASS 2>/dev/null | cut -d '\"' -f4",
        expect.any(Function),
      );
    });

    it('should return null if exec throws', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'Apple_Terminal';
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(new Error('Command not found'), null, null);
      });

      expect(await isTerminalAppFocused()).toBeNull();
    });
  });
});
