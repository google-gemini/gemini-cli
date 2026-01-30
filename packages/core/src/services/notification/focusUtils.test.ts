/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { isTerminalAppFocused } from './focusUtils.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('focusUtils', () => {
  const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;
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
    mockExecSync.mockReturnValue('');
  });

  afterEach(() => {
    process.env['TERM_PROGRAM'] = originalEnvTermProgram;
    process.env['TERM'] = originalEnvTerm;
    vi.restoreAllMocks();
  });

  describe('isTerminalAppFocused', () => {
    it('should return null if neither TERM_PROGRAM nor TERM is set', () => {
      delete process.env['TERM_PROGRAM'];
      delete process.env['TERM'];
      expect(isTerminalAppFocused()).toBeNull();
    });

    it('should fallback to TERM if TERM_PROGRAM is missing (Kitty)', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      delete process.env['TERM_PROGRAM'];
      process.env['TERM'] = 'xterm-kitty';
      mockExecSync.mockReturnValue('kitty\n');

      expect(isTerminalAppFocused()).toBe(true);
    });

    it('should fallback to TERM if TERM_PROGRAM is missing (Alacritty)', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      delete process.env['TERM_PROGRAM'];
      process.env['TERM'] = 'alacritty';
      mockExecSync.mockReturnValue('Alacritty\n');

      expect(isTerminalAppFocused()).toBe(true);
    });

    it('should return true on macOS for iTerm2', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'iTerm.app';
      mockExecSync.mockReturnValue('iTerm2\n');

      expect(isTerminalAppFocused()).toBe(true);
    });

    it('should return true on macOS for VS Code', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'vscode';
      mockExecSync.mockReturnValue('Code\n');

      expect(isTerminalAppFocused()).toBe(true);
    });

    it('should return true on macOS for WezTerm', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'WezTerm';
      mockExecSync.mockReturnValue('wezterm-gui\n');

      expect(isTerminalAppFocused()).toBe(true);
    });

    it('should return true on macOS if terminal is frontmost (Apple_Terminal)', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'Apple_Terminal';
      mockExecSync.mockReturnValue('Terminal\n');

      expect(isTerminalAppFocused()).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        "lsappinfo info -only Name `lsappinfo front` | cut -d '\"' -f4",
        expect.any(Object),
      );
    });

    it('should return false on macOS if terminal is NOT frontmost (Apple_Terminal)', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'Apple_Terminal';
      mockExecSync.mockReturnValue('OtherApp\n');

      expect(isTerminalAppFocused()).toBe(false);
    });

    it('should return true on macOS for Warp', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'WarpTerminal';
      mockExecSync.mockReturnValue('Warp\n');

      expect(isTerminalAppFocused()).toBe(true);
    });

    it('should return true on Windows if terminal is frontmost', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env['TERM_PROGRAM'] = 'Apple_Terminal';
      mockExecSync.mockReturnValue('Terminal\n');

      expect(isTerminalAppFocused()).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('powershell'),
        expect.any(Object),
      );
    });

    it('should return true on Linux if terminal is frontmost', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env['TERM_PROGRAM'] = 'Apple_Terminal';
      mockExecSync.mockReturnValue('Terminal\n');

      expect(isTerminalAppFocused()).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        "xdotool getwindowfocus getwindowname 2>/dev/null || xprop -id $(xdotool getwindowfocus) WM_CLASS 2>/dev/null | cut -d '\"' -f4",
        expect.any(Object),
      );
    });

    it('should return null if execSync throws', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env['TERM_PROGRAM'] = 'Apple_Terminal';
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      expect(isTerminalAppFocused()).toBeNull();
    });
  });
});
