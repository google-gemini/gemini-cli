/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import clipboardy from 'clipboardy';
import {
  isAtCommand,
  isSlashCommand,
  copyToClipboard,
  getUrlOpenCommand,
} from './commandUtils.js';

// Constants used by OSC-52 tests
const ESC = '\u001B';
const BEL = '\u0007';
const ST = '\u001B\\';

// Mock clipboardy
vi.mock('clipboardy', () => ({
  default: {
    write: vi.fn(),
  },
}));

// Mock child_process
vi.mock('child_process');

// fs (for /dev/tty)
const mockFs = vi.hoisted(() => ({
  createWriteStream: vi.fn(),
  constants: { W_OK: 2 },
}));
vi.mock('node:fs', () => ({
  default: mockFs,
}));

// Mock process.platform for platform-specific tests
const mockProcess = vi.hoisted(() => ({
  platform: 'darwin',
}));

vi.stubGlobal(
  'process',
  Object.create(process, {
    platform: {
      get: () => mockProcess.platform,
      configurable: true, // Allows the property to be changed later if needed
    },
  }),
);

const makeWritable = (opts?: { isTTY?: boolean; writeReturn?: boolean }) => {
  const { isTTY = false, writeReturn = true } = opts ?? {};
  const stream = Object.assign(new EventEmitter(), {
    write: vi.fn().mockReturnValue(writeReturn),
    end: vi.fn(),
    destroy: vi.fn(),
    isTTY,
    once: EventEmitter.prototype.once,
    on: EventEmitter.prototype.on,
    off: EventEmitter.prototype.off,
    removeAllListeners: EventEmitter.prototype.removeAllListeners,
  }) as unknown as EventEmitter & {
    write: Mock;
    end: Mock;
    isTTY?: boolean;
    removeAllListeners: Mock;
  };
  return stream;
};

const resetEnv = () => {
  delete process.env['TMUX'];
  delete process.env['STY'];
  delete process.env['SSH_TTY'];
  delete process.env['SSH_CONNECTION'];
  delete process.env['SSH_CLIENT'];
  delete process.env['WSL_DISTRO_NAME'];
  delete process.env['WSLENV'];
  delete process.env['WSL_INTEROP'];
  delete process.env['TERM'];
};

interface MockChildProcess extends EventEmitter {
  stdin: EventEmitter & {
    write: Mock;
    end: Mock;
  };
  stderr: EventEmitter;
}

describe('commandUtils', () => {
  let mockSpawn: Mock;
  let mockChild: MockChildProcess;
  let mockClipboardyWrite: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset platform to default for test isolation
    mockProcess.platform = 'darwin';

    // Dynamically import and set up spawn mock
    const { spawn } = await import('node:child_process');
    mockSpawn = spawn as Mock;

    // Create mock child process with stdout/stderr emitters
    mockChild = Object.assign(new EventEmitter(), {
      stdin: Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      }),
      stdout: Object.assign(new EventEmitter(), {
        destroy: vi.fn(),
      }),
      stderr: Object.assign(new EventEmitter(), {
        destroy: vi.fn(),
      }),
    }) as MockChildProcess;

    mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

    // Setup clipboardy mock
    mockClipboardyWrite = clipboardy.write as Mock;

    // default: /dev/tty creation succeeds and emits 'open'
    mockFs.createWriteStream.mockImplementation(() => {
      const tty = makeWritable({ isTTY: true });
      setTimeout(() => tty.emit('open'), 0);
      return tty;
    });

    // default: stdio are not TTY for tests unless explicitly set
    Object.defineProperty(process, 'stderr', {
      value: makeWritable({ isTTY: false }),
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: makeWritable({ isTTY: false }),
      configurable: true,
    });

    resetEnv();
  });

  describe('isAtCommand', () => {
    it('should return true when query starts with @', () => {
      expect(isAtCommand('@file')).toBe(true);
      expect(isAtCommand('@path/to/file')).toBe(true);
      expect(isAtCommand('@')).toBe(true);
    });

    it('should return true when query contains @ preceded by whitespace', () => {
      expect(isAtCommand('hello @file')).toBe(true);
      expect(isAtCommand('some text @path/to/file')).toBe(true);
      expect(isAtCommand('   @file')).toBe(true);
    });

    it('should return false when query does not start with @ and has no spaced @', () => {
      expect(isAtCommand('file')).toBe(false);
      expect(isAtCommand('hello')).toBe(false);
      expect(isAtCommand('')).toBe(false);
      expect(isAtCommand('email@domain.com')).toBe(false);
      expect(isAtCommand('user@host')).toBe(false);
    });

    it('should return false when @ is not preceded by whitespace', () => {
      expect(isAtCommand('hello@file')).toBe(false);
      expect(isAtCommand('text@path')).toBe(false);
    });
  });

  describe('isSlashCommand', () => {
    it('should return true when query starts with /', () => {
      expect(isSlashCommand('/help')).toBe(true);
      expect(isSlashCommand('/memory show')).toBe(true);
      expect(isSlashCommand('/clear')).toBe(true);
      expect(isSlashCommand('/')).toBe(true);
    });

    it('should return false when query does not start with /', () => {
      expect(isSlashCommand('help')).toBe(false);
      expect(isSlashCommand('memory show')).toBe(false);
      expect(isSlashCommand('')).toBe(false);
      expect(isSlashCommand('path/to/file')).toBe(false);
      expect(isSlashCommand(' /help')).toBe(false);
    });

    it('should return false for line comments starting with //', () => {
      expect(isSlashCommand('// This is a comment')).toBe(false);
      expect(isSlashCommand('// check if variants base info all filled.')).toBe(
        false,
      );
      expect(isSlashCommand('//comment without space')).toBe(false);
    });

    it('should return false for block comments starting with /*', () => {
      expect(isSlashCommand('/* This is a block comment */')).toBe(false);
      expect(isSlashCommand('/*\n * Multi-line comment\n */')).toBe(false);
      expect(isSlashCommand('/*comment without space*/')).toBe(false);
    });
  });

  describe('copyToClipboard', () => {
    it('uses clipboardy when not in SSH/tmux/screen/WSL (even if TTYs exist)', async () => {
      const testText = 'Hello, world!';
      mockClipboardyWrite.mockResolvedValue(undefined);

      // even if stderr/stdout are TTY, without the env signals we fallback
      Object.defineProperty(process, 'stderr', {
        value: makeWritable({ isTTY: true }),
        configurable: true,
      });
      Object.defineProperty(process, 'stdout', {
        value: makeWritable({ isTTY: true }),
        configurable: true,
      });

      await copyToClipboard(testText);

      expect(mockClipboardyWrite).toHaveBeenCalledWith(testText);
    });

    it('writes OSC-52 to /dev/tty when in SSH', async () => {
      const testText = 'abc';
      const tty = makeWritable({ isTTY: true });
      mockFs.createWriteStream.mockImplementation(() => {
        setTimeout(() => tty.emit('open'), 0);
        return tty;
      });

      process.env['SSH_CONNECTION'] = '1';

      await copyToClipboard(testText);

      const b64 = Buffer.from(testText, 'utf8').toString('base64');
      const expected = `${ESC}]52;c;${b64}${BEL}`;

      expect(tty.write).toHaveBeenCalledTimes(1);
      expect(tty.write.mock.calls[0][0]).toBe(expected);
      expect(tty.end).toHaveBeenCalledTimes(1); // /dev/tty closed after write
      expect(mockClipboardyWrite).not.toHaveBeenCalled();
    });

    it('wraps OSC-52 for tmux when in SSH', async () => {
      const testText = 'tmux-copy';
      const tty = makeWritable({ isTTY: true });
      mockFs.createWriteStream.mockImplementation(() => {
        setTimeout(() => tty.emit('open'), 0);
        return tty;
      });

      process.env['SSH_CONNECTION'] = '1';
      process.env['TMUX'] = '1';

      await copyToClipboard(testText);

      const written = tty.write.mock.calls[0][0] as string;
      // Starts with tmux DCS wrapper and ends with ST
      expect(written.startsWith(`${ESC}Ptmux;`)).toBe(true);
      expect(written.endsWith(ST)).toBe(true);
      // ESC bytes in payload are doubled
      expect(written).toContain(`${ESC}${ESC}]52;c;`);
      expect(mockClipboardyWrite).not.toHaveBeenCalled();
    });

    it('wraps OSC-52 for GNU screen with chunked DCS when in SSH', async () => {
      // ensure payload > chunk size (240) so there are multiple chunks
      const testText = 'x'.repeat(1200);
      const tty = makeWritable({ isTTY: true });
      mockFs.createWriteStream.mockImplementation(() => {
        setTimeout(() => tty.emit('open'), 0);
        return tty;
      });

      process.env['SSH_CONNECTION'] = '1';
      process.env['STY'] = 'screen-session';

      await copyToClipboard(testText);

      const written = tty.write.mock.calls[0][0] as string;
      const chunkStarts = (written.match(new RegExp(`${ESC}P`, 'g')) || [])
        .length;
      const chunkEnds = written.split(ST).length - 1;

      expect(chunkStarts).toBeGreaterThan(1);
      expect(chunkStarts).toBe(chunkEnds);
      expect(written).toContain(']52;c;'); // contains base OSC-52 marker
      expect(mockClipboardyWrite).not.toHaveBeenCalled();
    });

    it('falls back to stderr when /dev/tty unavailable and stderr is a TTY', async () => {
      const testText = 'stderr-tty';
      const stderrStream = makeWritable({ isTTY: true });
      Object.defineProperty(process, 'stderr', {
        value: stderrStream,
        configurable: true,
      });

      process.env['SSH_TTY'] = '/dev/pts/1';

      // Simulate /dev/tty access failure
      mockFs.createWriteStream.mockImplementation(() => {
        const tty = makeWritable({ isTTY: true });
        setTimeout(() => tty.emit('error', new Error('EACCES')), 0);
        return tty;
      });

      await copyToClipboard(testText);

      const b64 = Buffer.from(testText, 'utf8').toString('base64');
      const expected = `${ESC}]52;c;${b64}${BEL}`;

      expect(stderrStream.write).toHaveBeenCalledWith(expected);
      expect(mockClipboardyWrite).not.toHaveBeenCalled();
    });

    it('falls back to clipboardy when no TTY is available', async () => {
      const testText = 'no-tty';
      mockClipboardyWrite.mockResolvedValue(undefined);

      // /dev/tty throws or errors
      mockFs.createWriteStream.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      process.env['SSH_CLIENT'] = 'client';

      await copyToClipboard(testText);

      expect(mockClipboardyWrite).toHaveBeenCalledWith(testText);
    });

    it('resolves on drain when backpressure occurs', async () => {
      const tty = makeWritable({ isTTY: true, writeReturn: false });
      mockFs.createWriteStream.mockImplementation(() => {
        setTimeout(() => tty.emit('open'), 0);
        return tty;
      });
      process.env['SSH_CONNECTION'] = '1';

      const p = copyToClipboard('drain-test');
      setTimeout(() => {
        tty.emit('drain');
      }, 0);
      await expect(p).resolves.toBeUndefined();
    });

    it('propagates errors from OSC-52 write path', async () => {
      const tty = makeWritable({ isTTY: true, writeReturn: false });
      mockFs.createWriteStream.mockImplementation(() => {
        setTimeout(() => tty.emit('open'), 0);
        return tty;
      });
      process.env['SSH_CONNECTION'] = '1';

      const p = copyToClipboard('err-test');
      setTimeout(() => {
        tty.emit('error', new Error('tty error'));
      }, 0);

      await expect(p).rejects.toThrow('tty error');
      expect(mockClipboardyWrite).not.toHaveBeenCalled();
    });

    it('does nothing for empty string', async () => {
      await copyToClipboard('');
      expect(mockClipboardyWrite).not.toHaveBeenCalled();
      // ensure no accidental writes to stdio either
      const stderrStream = process.stderr as unknown as { write: Mock };
      const stdoutStream = process.stdout as unknown as { write: Mock };
      expect(stderrStream.write).not.toHaveBeenCalled();
      expect(stdoutStream.write).not.toHaveBeenCalled();
    });

    it('uses clipboardy when not in eligible env even if /dev/tty exists', async () => {
      const tty = makeWritable({ isTTY: true });
      mockFs.createWriteStream.mockImplementation(() => {
        setTimeout(() => tty.emit('open'), 0);
        return tty;
      });
      const text = 'local-terminal';
      mockClipboardyWrite.mockResolvedValue(undefined);

      await copyToClipboard(text);

      expect(mockClipboardyWrite).toHaveBeenCalledWith(text);
      expect(tty.write).not.toHaveBeenCalled();
      expect(tty.end).not.toHaveBeenCalled();
    });

    it('falls back if /dev/tty emits error (e.g. sandbox)', async () => {
      const testText = 'access-denied-fallback';
      process.env['SSH_CONNECTION'] = '1'; // normally would trigger OSC52 on TTY

      mockFs.createWriteStream.mockImplementation(() => {
        const stream = makeWritable({ isTTY: true });
        // Emit error instead of open
        setTimeout(() => stream.emit('error', new Error('EACCES')), 0);
        return stream;
      });

      // Fallback to clipboardy since stdio isn't configured as TTY in this test (default from beforeEach)
      mockClipboardyWrite.mockResolvedValue(undefined);

      await copyToClipboard(testText);

      expect(mockFs.createWriteStream).toHaveBeenCalled();
      expect(mockClipboardyWrite).toHaveBeenCalledWith(testText);
    });
    it('uses clipboardy in tmux when not in SSH/WSL', async () => {
      const tty = makeWritable({ isTTY: true });
      mockFs.createWriteStream.mockImplementation(() => {
        setTimeout(() => tty.emit('open'), 0);
        return tty;
      });
      const text = 'tmux-local';
      mockClipboardyWrite.mockResolvedValue(undefined);

      process.env['TMUX'] = '1';

      await copyToClipboard(text);

      expect(mockClipboardyWrite).toHaveBeenCalledWith(text);
      expect(tty.write).not.toHaveBeenCalled();
      expect(tty.end).not.toHaveBeenCalled();
    });

    it('falls back if /dev/tty hangs (timeout)', async () => {
      const testText = 'timeout-fallback';
      process.env['SSH_CONNECTION'] = '1';

      mockFs.createWriteStream.mockImplementation(() =>
        // Stream that never emits open or error
        makeWritable({ isTTY: true }),
      );

      mockClipboardyWrite.mockResolvedValue(undefined);

      // Should complete even though stream hangs
      await copyToClipboard(testText);

      expect(mockFs.createWriteStream).toHaveBeenCalled();
      expect(mockClipboardyWrite).toHaveBeenCalledWith(testText);
    });

    it('skips /dev/tty on Windows and uses stderr fallback for OSC-52', async () => {
      mockProcess.platform = 'win32';
      const stderrStream = makeWritable({ isTTY: true });
      Object.defineProperty(process, 'stderr', {
        value: stderrStream,
        configurable: true,
      });

      // Set SSH environment to trigger OSC-52 path
      process.env['SSH_CONNECTION'] = '1';

      await copyToClipboard('windows-ssh-test');

      expect(mockFs.createWriteStream).not.toHaveBeenCalled();
      expect(stderrStream.write).toHaveBeenCalled();
      expect(mockClipboardyWrite).not.toHaveBeenCalled();
    });

    it('uses clipboardy on native Windows without SSH/WSL', async () => {
      mockProcess.platform = 'win32';
      mockClipboardyWrite.mockResolvedValue(undefined);

      await copyToClipboard('windows-native-test');

      // Fallback to clipboardy and not /dev/tty
      expect(mockClipboardyWrite).toHaveBeenCalledWith('windows-native-test');
      expect(mockFs.createWriteStream).not.toHaveBeenCalled();
    });
  });

  describe('getUrlOpenCommand', () => {
    describe('on macOS (darwin)', () => {
      beforeEach(() => {
        mockProcess.platform = 'darwin';
      });
      it('should return open', () => {
        expect(getUrlOpenCommand()).toBe('open');
      });
    });

    describe('on Windows (win32)', () => {
      beforeEach(() => {
        mockProcess.platform = 'win32';
      });
      it('should return start', () => {
        expect(getUrlOpenCommand()).toBe('start');
      });
    });

    describe('on Linux (linux)', () => {
      beforeEach(() => {
        mockProcess.platform = 'linux';
      });
      it('should return xdg-open', () => {
        expect(getUrlOpenCommand()).toBe('xdg-open');
      });
    });

    describe('on unmatched OS', () => {
      beforeEach(() => {
        mockProcess.platform = 'unmatched';
      });
      it('should return xdg-open', () => {
        expect(getUrlOpenCommand()).toBe('xdg-open');
      });
    });
  });
});
