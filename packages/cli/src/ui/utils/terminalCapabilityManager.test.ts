/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TerminalCapabilityManager,
  cleanupTerminalOnExit,
} from './terminalCapabilityManager.js';
import { EventEmitter } from 'node:events';
import {
  enableKittyKeyboardProtocol,
  enableModifyOtherKeys,
  disableKittyKeyboardProtocol,
  disableModifyOtherKeys,
  disableBracketedPasteMode,
  disableMouseEvents,
  enableLineWrapping,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs';

// Mock fs
vi.mock('node:fs', () => ({
  writeSync: vi.fn(),
}));

// Mock core
vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    log: vi.fn(),
    warn: vi.fn(),
  },
  enableKittyKeyboardProtocol: vi.fn(),
  disableKittyKeyboardProtocol: vi.fn(),
  enableModifyOtherKeys: vi.fn(),
  disableModifyOtherKeys: vi.fn(),
  enableBracketedPasteMode: vi.fn(),
  disableBracketedPasteMode: vi.fn(),
  disableMouseEvents: vi.fn(),
  enableLineWrapping: vi.fn(),
}));

describe('TerminalCapabilityManager', () => {
  let stdin: EventEmitter & {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?: (mode: boolean) => void;
    removeListener?: (
      event: string,
      listener: (...args: unknown[]) => void,
    ) => void;
  };
  let stdout: { isTTY?: boolean; fd?: number };
  // Save original process properties
  const originalStdin = process.stdin;
  const originalStdout = process.stdout;

  beforeEach(() => {
    vi.resetAllMocks();

    // Reset singleton
    TerminalCapabilityManager.resetInstanceForTesting();

    // Setup process mocks
    stdin = new EventEmitter();
    stdin.isTTY = true;
    stdin.isRaw = false;
    stdin.setRawMode = vi.fn();
    stdin.removeListener = vi.fn();

    stdout = { isTTY: true, fd: 1 };

    // Use defineProperty to mock process.stdin/stdout
    Object.defineProperty(process, 'stdin', {
      value: stdin,
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: stdout,
      configurable: true,
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore original process properties
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      configurable: true,
    });
  });

  it('should detect Kitty support when u response is received', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Simulate Kitty response: \x1b[?1u
    stdin.emit('data', Buffer.from('\x1b[?1u'));
    // Complete detection with DA1
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    manager.enableSupportedModes();
    expect(manager.isKittyProtocolEnabled()).toBe(true);
  });

  it('should detect Background Color', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Simulate OSC 11 response
    // \x1b]11;rgb:0000/ff00/0000\x1b\
    // RGB: 0, 255, 0 -> #00ff00
    stdin.emit('data', Buffer.from('\x1b]11;rgb:0000/ffff/0000\x1b\\'));
    // Complete detection with DA1
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    expect(manager.getTerminalBackgroundColor()).toBe('#00ff00');
  });

  it('should ignore #ffffff in tmux as it is a common false positive', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    vi.spyOn(manager, 'isTmux').mockReturnValue(true);

    const promise = manager.detectCapabilities();

    // Simulate OSC 11 response for white
    stdin.emit('data', Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'));
    // Complete detection with DA1
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    expect(manager.getTerminalBackgroundColor()).toBeUndefined();
  });

  it('should not ignore #ffffff when NOT in tmux', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    vi.spyOn(manager, 'isTmux').mockReturnValue(false);

    const promise = manager.detectCapabilities();

    // Simulate OSC 11 response for white
    stdin.emit('data', Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'));
    // Complete detection with DA1
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    expect(manager.getTerminalBackgroundColor()).toBe('#ffffff');
  });

  it('should NOT ignore other colors in tmux', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    vi.stubEnv('TMUX', '1');

    const promise = manager.detectCapabilities();

    // Simulate OSC 11 response for grey
    stdin.emit('data', Buffer.from('\x1b]11;rgb:8888/8888/8888\x1b\\'));
    // Complete detection with DA1
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    expect(manager.getTerminalBackgroundColor()).toBe('#888888');
  });

  it('should detect Terminal Name', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Simulate Terminal Name response
    stdin.emit('data', Buffer.from('\x1bP>|WezTerm 20240203\x1b\\'));
    // Complete detection with DA1
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    expect(manager.getTerminalName()).toBe('WezTerm 20240203');
  });

  it('should complete early if sentinel (DA1) is found', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    stdin.emit('data', Buffer.from('\x1b[?1u'));
    stdin.emit('data', Buffer.from('\x1b]11;rgb:0000/0000/0000\x1b\\'));
    // Sentinel
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    // Should resolve without waiting for timeout
    await promise;

    manager.enableSupportedModes();

    expect(manager.isKittyProtocolEnabled()).toBe(true);
    expect(manager.getTerminalBackgroundColor()).toBe('#000000');
  });

  it('should timeout if no DA1 (c) is received', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Simulate only Kitty response
    stdin.emit('data', Buffer.from('\x1b[?1u'));

    // Advance to timeout
    vi.advanceTimersByTime(1000);

    await promise;
    manager.enableSupportedModes();
    expect(manager.isKittyProtocolEnabled()).toBe(true);
  });

  it('should not detect Kitty if only DA1 (c) is received', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Simulate DA1 response only: \x1b[?62;c
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    manager.enableSupportedModes();
    expect(manager.isKittyProtocolEnabled()).toBe(false);
  });

  it('should handle split chunks', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Split response: \x1b[? 1u
    stdin.emit('data', Buffer.from('\x1b[?'));
    stdin.emit('data', Buffer.from('1u'));
    // Complete with DA1
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    manager.enableSupportedModes();
    expect(manager.isKittyProtocolEnabled()).toBe(true);
  });

  describe('ambiguous-width character detection', () => {
    const DA1 = '\x1b[?62c';

    it('should default to narrow before detection runs', () => {
      const manager = TerminalCapabilityManager.getInstance();
      expect(manager.areAmbiguousCharactersWide()).toBe(false);
    });

    it('should detect wide rendering when the cursor lands on column 3', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Cursor Position Report after printing one glyph at column 1.
      stdin.emit('data', Buffer.from('\x1b[1;3R'));
      stdin.emit('data', Buffer.from(DA1));

      await promise;
      expect(manager.areAmbiguousCharactersWide()).toBe(true);
    });

    it('should detect narrow rendering when the cursor lands on column 2', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      stdin.emit('data', Buffer.from('\x1b[24;2R'));
      stdin.emit('data', Buffer.from(DA1));

      await promise;
      expect(manager.areAmbiguousCharactersWide()).toBe(false);
    });

    it('should stay narrow when the terminal does not report a cursor position', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      stdin.emit('data', Buffer.from(DA1));

      await promise;
      expect(manager.areAmbiguousCharactersWide()).toBe(false);
    });

    it('should stay narrow when detection times out', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      await vi.advanceTimersByTimeAsync(1000);
      await promise;
      expect(manager.areAmbiguousCharactersWide()).toBe(false);
    });

    it('should ignore cursor columns that cannot come from the probe', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // e.g. a report produced by something other than our one-glyph probe.
      stdin.emit('data', Buffer.from('\x1b[12;40R'));
      stdin.emit('data', Buffer.from(DA1));

      await promise;
      expect(manager.areAmbiguousCharactersWide()).toBe(false);
    });

    it('should still honour the probe response after a stray cursor position report', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // A leftover report (e.g. from a shell prompt that queried the cursor
      // position) arrives first, in its own chunk, followed by the real
      // answer to our probe.
      stdin.emit('data', Buffer.from('\x1b[12;40R'));
      stdin.emit('data', Buffer.from('\x1b[1;3R'));
      stdin.emit('data', Buffer.from(DA1));

      await promise;
      expect(manager.areAmbiguousCharactersWide()).toBe(true);
    });

    it('should use the first plausible report when several arrive in one chunk', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      stdin.emit('data', Buffer.from('\x1b[12;40R\x1b[1;2R\x1b[1;3R' + DA1));

      await promise;
      expect(manager.areAmbiguousCharactersWide()).toBe(false);
    });

    it('should handle a cursor position report split across chunks', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      stdin.emit('data', Buffer.from('\x1b[1;'));
      stdin.emit('data', Buffer.from('3R'));
      stdin.emit('data', Buffer.from(DA1));

      await promise;
      expect(manager.areAmbiguousCharactersWide()).toBe(true);
    });

    it('should detect wide rendering alongside the other responses', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      stdin.emit('data', Buffer.from('\x1b[?1u'));
      stdin.emit('data', Buffer.from('\x1b]11;rgb:0000/0000/0000\x1b\\'));
      stdin.emit('data', Buffer.from('\x1bP>|WezTerm 20240203\x1b\\'));
      stdin.emit('data', Buffer.from('\x1b[>4;2m'));
      stdin.emit('data', Buffer.from('\x1b[1;3R'));
      stdin.emit('data', Buffer.from(DA1));

      await promise;
      expect(manager.areAmbiguousCharactersWide()).toBe(true);
      expect(manager.getTerminalName()).toBe('WezTerm 20240203');
      expect(manager.getTerminalBackgroundColor()).toBe('#000000');
    });

    it('should print the probe glyph hidden, before the DA1 sentinel, and clear the line', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();
      stdin.emit('data', Buffer.from(DA1));
      await promise;

      const written = vi.mocked(fs.writeSync).mock.calls[0][1];
      const probe = '\r\u2500\x1b[6n';
      const hidden = '\x1b[8m';
      const da1Query = '\x1b[c';
      const clearLine = '\x1b[2K\r';

      expect(written).toContain(probe);
      expect(written.indexOf(hidden)).toBeLessThan(written.indexOf(probe));
      expect(written.indexOf(probe)).toBeLessThan(written.indexOf(da1Query));
      expect(written.indexOf(da1Query)).toBeLessThan(
        written.indexOf(clearLine),
      );
    });
  });

  describe('modifyOtherKeys detection', () => {
    it('should detect modifyOtherKeys support (level 2)', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Simulate modifyOtherKeys level 2 response: \x1b[>4;2m
      stdin.emit('data', Buffer.from('\x1b[>4;2m'));
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      manager.enableSupportedModes();

      expect(enableModifyOtherKeys).toHaveBeenCalled();
    });

    it('should not enable modifyOtherKeys for level 0', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Simulate modifyOtherKeys level 0 response: \x1b[>4;0m
      stdin.emit('data', Buffer.from('\x1b[>4;0m'));
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      manager.enableSupportedModes();

      expect(enableModifyOtherKeys).not.toHaveBeenCalled();
    });

    it('should prefer Kitty over modifyOtherKeys', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Simulate both Kitty and modifyOtherKeys responses
      stdin.emit('data', Buffer.from('\x1b[?1u'));
      stdin.emit('data', Buffer.from('\x1b[>4;2m'));
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;
      manager.enableSupportedModes();
      expect(manager.isKittyProtocolEnabled()).toBe(true);

      expect(enableKittyKeyboardProtocol).toHaveBeenCalled();
      expect(enableModifyOtherKeys).not.toHaveBeenCalled();
    });

    it('should enable modifyOtherKeys when Kitty not supported', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Simulate only modifyOtherKeys response (no Kitty)
      stdin.emit('data', Buffer.from('\x1b[>4;2m'));
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      manager.enableSupportedModes();

      expect(manager.isKittyProtocolEnabled()).toBe(false);
      expect(enableModifyOtherKeys).toHaveBeenCalled();
    });

    it('should handle split modifyOtherKeys response chunks', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Split response: \x1b[>4;2m
      stdin.emit('data', Buffer.from('\x1b[>4;'));
      stdin.emit('data', Buffer.from('2m'));
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      manager.enableSupportedModes();

      expect(enableModifyOtherKeys).toHaveBeenCalled();
    });

    it('should detect modifyOtherKeys with other capabilities', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      stdin.emit('data', Buffer.from('\x1b]11;rgb:1a1a/1a1a/1a1a\x1b\\')); // background color
      stdin.emit('data', Buffer.from('\x1bP>|tmux\x1b\\')); // Terminal name
      stdin.emit('data', Buffer.from('\x1b[>4;2m')); // modifyOtherKeys
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      manager.enableSupportedModes();

      expect(manager.getTerminalBackgroundColor()).toBe('#1a1a1a');
      expect(manager.getTerminalName()).toBe('tmux');

      expect(enableModifyOtherKeys).toHaveBeenCalled();
    });

    it('should not enable modifyOtherKeys without explicit response', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Simulate only DA1 response (no specific MOK or Kitty response)
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      manager.enableSupportedModes();

      expect(manager.isKittyProtocolEnabled()).toBe(false);
      expect(enableModifyOtherKeys).not.toHaveBeenCalled();
    });

    it('should wrap queries in hidden/clear sequence', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      void manager.detectCapabilities();

      expect(fs.writeSync).toHaveBeenCalledWith(
        expect.anything(),
        // eslint-disable-next-line no-control-regex
        expect.stringMatching(/^\x1b\[8m.*\x1b\[2K\r\x1b\[0m$/s),
      );
    });
  });

  describe('isGhosttyTerminal', () => {
    const manager = TerminalCapabilityManager.getInstance();

    it.each([
      {
        name: 'Ghostty (terminal name)',
        terminalName: 'Ghostty',
        env: {},
        expected: true,
      },
      {
        name: 'ghostty (TERM_PROGRAM)',
        terminalName: undefined,
        env: { TERM_PROGRAM: 'ghostty' },
        expected: true,
      },
      {
        name: 'xterm-ghostty (TERM)',
        terminalName: undefined,
        env: { TERM: 'xterm-ghostty' },
        expected: true,
      },
      {
        name: 'iTerm.app (TERM_PROGRAM)',
        terminalName: undefined,
        env: { TERM_PROGRAM: 'iTerm.app' },
        expected: false,
      },
      {
        name: 'undefined env',
        terminalName: undefined,
        env: {},
        expected: false,
      },
    ])(
      'should return $expected for $name',
      ({ terminalName, env, expected }) => {
        vi.spyOn(manager, 'getTerminalName').mockReturnValue(terminalName);
        expect(manager.isGhosttyTerminal(env)).toBe(expected);
      },
    );
  });

  describe('isTmux', () => {
    const manager = TerminalCapabilityManager.getInstance();

    it('returns true when TMUX is set', () => {
      expect(manager.isTmux({ TMUX: '1' })).toBe(true);
      expect(manager.isTmux({ TMUX: 'tmux-1234' })).toBe(true);
    });

    it('returns false when TMUX is not set', () => {
      expect(manager.isTmux({})).toBe(false);
      expect(manager.isTmux({ STY: '1' })).toBe(false);
    });
  });

  describe('isScreen', () => {
    const manager = TerminalCapabilityManager.getInstance();

    it('returns true when STY is set', () => {
      expect(manager.isScreen({ STY: '1' })).toBe(true);
      expect(manager.isScreen({ STY: 'screen.1234' })).toBe(true);
    });

    it('returns false when STY is not set', () => {
      expect(manager.isScreen({})).toBe(false);
      expect(manager.isScreen({ TMUX: '1' })).toBe(false);
    });
  });

  describe('isITerm2', () => {
    const manager = TerminalCapabilityManager.getInstance();

    it('returns true when iTerm is in terminal name', () => {
      vi.spyOn(manager, 'getTerminalName').mockReturnValue('iTerm.app');
      expect(manager.isITerm2({})).toBe(true);
    });

    it('returns true when TERM_PROGRAM is iTerm.app', () => {
      vi.spyOn(manager, 'getTerminalName').mockReturnValue(undefined);
      expect(manager.isITerm2({ TERM_PROGRAM: 'iTerm.app' })).toBe(true);
    });

    it('returns false otherwise', () => {
      vi.spyOn(manager, 'getTerminalName').mockReturnValue('xterm');
      expect(manager.isITerm2({ TERM_PROGRAM: 'Apple_Terminal' })).toBe(false);
    });
  });

  describe('isAlacritty', () => {
    const manager = TerminalCapabilityManager.getInstance();

    it('returns true when ALACRITTY_WINDOW_ID is set', () => {
      vi.spyOn(manager, 'getTerminalName').mockReturnValue(undefined);
      expect(manager.isAlacritty({ ALACRITTY_WINDOW_ID: '123' })).toBe(true);
    });

    it('returns true when TERM is alacritty', () => {
      vi.spyOn(manager, 'getTerminalName').mockReturnValue(undefined);
      expect(manager.isAlacritty({ TERM: 'alacritty' })).toBe(true);
    });

    it('returns true when terminal name contains alacritty', () => {
      vi.spyOn(manager, 'getTerminalName').mockReturnValue('alacritty');
      expect(manager.isAlacritty({})).toBe(true);
    });

    it('returns false otherwise', () => {
      vi.spyOn(manager, 'getTerminalName').mockReturnValue(undefined);
      expect(manager.isAlacritty({ TERM: 'xterm' })).toBe(false);
    });
  });

  describe('isAppleTerminal', () => {
    const manager = TerminalCapabilityManager.getInstance();

    it('returns true when apple_terminal is in terminal name', () => {
      vi.spyOn(manager, 'getTerminalName').mockReturnValue('apple_terminal');
      expect(manager.isAppleTerminal({})).toBe(true);
    });

    it('returns true when TERM_PROGRAM is Apple_Terminal', () => {
      vi.spyOn(manager, 'getTerminalName').mockReturnValue(undefined);
      expect(manager.isAppleTerminal({ TERM_PROGRAM: 'Apple_Terminal' })).toBe(
        true,
      );
    });

    it('returns false otherwise', () => {
      vi.spyOn(manager, 'getTerminalName').mockReturnValue('xterm');
      expect(manager.isAppleTerminal({ TERM_PROGRAM: 'iTerm.app' })).toBe(
        false,
      );
    });
  });

  describe('isVSCodeTerminal', () => {
    const manager = TerminalCapabilityManager.getInstance();

    it('returns true when TERM_PROGRAM is vscode', () => {
      expect(manager.isVSCodeTerminal({ TERM_PROGRAM: 'vscode' })).toBe(true);
    });

    it('returns false otherwise', () => {
      expect(manager.isVSCodeTerminal({ TERM_PROGRAM: 'iTerm.app' })).toBe(
        false,
      );
    });
  });

  describe('isWindowsTerminal', () => {
    const manager = TerminalCapabilityManager.getInstance();

    it('returns true when WT_SESSION is set', () => {
      expect(manager.isWindowsTerminal({ WT_SESSION: 'some-guid' })).toBe(true);
    });

    it('returns false otherwise', () => {
      expect(manager.isWindowsTerminal({})).toBe(false);
    });
  });

  describe('cleanupTerminalOnExit', () => {
    it('restores auto-wrap together with the other terminal modes in one synchronous write', () => {
      cleanupTerminalOnExit();

      expect(fs.writeSync).toHaveBeenCalledTimes(1);
      const [fd, sequence] = vi.mocked(fs.writeSync).mock.calls[0] as [
        number,
        string,
      ];
      expect(fd).toBe(stdout.fd);
      // Kitty keyboard pop, modifyOtherKeys off, bracketed paste off, mouse
      // modes off, and finally auto-wrap (DECAWM) back on: it is turned off in
      // the alternate buffer and on ambiguous-wide terminals, and this hook is
      // the last line of defence on signals and process.exit().
      expect(sequence).toBe(
        '\x1b[<u\x1b[>4;0m\x1b[?2004l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?7h',
      );
      expect(enableLineWrapping).not.toHaveBeenCalled();
    });

    it('falls back to the individual resets, including auto-wrap, when stdout has no file descriptor', () => {
      stdout.fd = undefined;

      cleanupTerminalOnExit();

      expect(fs.writeSync).not.toHaveBeenCalled();
      expect(disableKittyKeyboardProtocol).toHaveBeenCalledTimes(1);
      expect(disableModifyOtherKeys).toHaveBeenCalledTimes(1);
      expect(disableBracketedPasteMode).toHaveBeenCalledTimes(1);
      expect(disableMouseEvents).toHaveBeenCalledTimes(1);
      expect(enableLineWrapping).toHaveBeenCalledTimes(1);
    });

    it('falls back to the individual resets when the synchronous write fails', () => {
      vi.mocked(fs.writeSync).mockImplementation(() => {
        throw new Error('EBADF');
      });

      cleanupTerminalOnExit();

      expect(enableLineWrapping).toHaveBeenCalledTimes(1);
      expect(disableMouseEvents).toHaveBeenCalledTimes(1);
    });
  });
});
