/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { patchStdio, createWorkingStdio } from './stdio.js';
import { coreEvents } from './events.js';

vi.mock('./events.js', () => ({
  coreEvents: {
    emitOutput: vi.fn(),
  },
}));

describe('stdio utils', () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let originalStderrWrite: typeof process.stderr.write;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    originalStderrWrite = process.stderr.write;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('patchStdio redirects stdout and stderr to coreEvents', () => {
    const cleanup = patchStdio();

    process.stdout.write('test stdout');
    expect(coreEvents.emitOutput).toHaveBeenCalledWith(
      false,
      'test stdout',
      undefined,
    );

    process.stderr.write('test stderr');
    expect(coreEvents.emitOutput).toHaveBeenCalledWith(
      true,
      'test stderr',
      undefined,
    );

    cleanup();

    // Verify cleanup
    expect(process.stdout.write).toBe(originalStdoutWrite);
    expect(process.stderr.write).toBe(originalStderrWrite);
  });

  it('createWorkingStdio writes to real stdout/stderr bypassing patch', () => {
    const cleanup = patchStdio();
    const { stdout, stderr } = createWorkingStdio();

    stdout.write('working stdout');
    expect(coreEvents.emitOutput).not.toHaveBeenCalled();

    stderr.write('working stderr');
    expect(coreEvents.emitOutput).not.toHaveBeenCalled();

    cleanup();
  });

  it('shows cursor on Windows when Ink positions the IME cursor and hides it when unfocused', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });

    try {
      vi.resetModules();
      const writeSpy = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const { createWorkingStdio: createWinWorkingStdio } = await import(
        './stdio.js'
      );
      const { stdout } = createWinWorkingStdio();

      // Plain writes should not be modified when cursor has not been shown for IME
      stdout.write('plain output');
      expect(writeSpy).toHaveBeenLastCalledWith('plain output');

      // Frame ending with Ink's positionImeCursor (\x1b[2A\x1b[5G) should append \x1b[?25h
      stdout.write('prompt line\nfooter line\n\x1b[2A\x1b[5G');
      expect(writeSpy).toHaveBeenLastCalledWith(
        'prompt line\nfooter line\n\x1b[2A\x1b[5G\x1b[?25h',
      );

      // Subsequent frame without cursor positioning should append \x1b[?25l to hide cursor
      stdout.write('streaming output\nfooter line\n');
      expect(writeSpy).toHaveBeenLastCalledWith(
        'streaming output\nfooter line\n\x1b[?25l',
      );

      // Synchronized output frame with cursor positioning should insert \x1b[?25h before \x1b[?2026l
      stdout.write('\x1b[?2026hframe content\x1b[10;4H\x1b[?2026l');
      expect(writeSpy).toHaveBeenLastCalledWith(
        '\x1b[?2026hframe content\x1b[10;4H\x1b[?25h\x1b[?2026l',
      );

      // Synchronized output frame without cursor positioning should insert \x1b[?25l before \x1b[?2026l
      stdout.write('\x1b[?2026hstreaming content\x1b[?2026l');
      expect(writeSpy).toHaveBeenLastCalledWith(
        '\x1b[?2026hstreaming content\x1b[?25l\x1b[?2026l',
      );
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it('wraps frame writes with Mode 2026 synchronized output sequences when not in tmux', async () => {
    vi.stubEnv('TMUX', '');
    vi.stubEnv('TERM', 'xterm-256color');
    vi.resetModules();
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const {
      createWorkingStdio: createSyncStdio,
      ENTER_SYNCHRONIZED_OUTPUT_SEQ,
      EXIT_SYNCHRONIZED_OUTPUT_SEQ,
    } = await import('./stdio.js');

    const { stdout } = createSyncStdio({
      synchronizedOutput: true,
    });

    stdout.write('spinner frame 1');
    expect(writeSpy).toHaveBeenLastCalledWith(
      `${ENTER_SYNCHRONIZED_OUTPUT_SEQ}spinner frame 1${EXIT_SYNCHRONIZED_OUTPUT_SEQ}`,
    );

    // Standalone mode sequences should pass through unmodified
    stdout.write('\x1b[?25l');
    expect(writeSpy).toHaveBeenLastCalledWith('\x1b[?25l');
  });

  it('wraps frame writes with tmux DCS synchronized output sequences when TMUX is set', async () => {
    vi.stubEnv('TMUX', '/tmp/tmux-1000/default,1234,0');
    vi.stubEnv('TERM', 'tmux-256color');
    vi.resetModules();
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const {
      createWorkingStdio: createSyncStdio,
      TMUX_ENTER_SYNCHRONIZED_OUTPUT_SEQ,
      TMUX_EXIT_SYNCHRONIZED_OUTPUT_SEQ,
    } = await import('./stdio.js');

    const { stdout } = createSyncStdio({
      synchronizedOutput: true,
    });

    stdout.write('spinner frame in tmux');
    expect(writeSpy).toHaveBeenLastCalledWith(
      `${TMUX_ENTER_SYNCHRONIZED_OUTPUT_SEQ}spinner frame in tmux${TMUX_EXIT_SYNCHRONIZED_OUTPUT_SEQ}`,
    );

    // Converts Mode 2026-wrapped frames to tmux DCS without double wrapping
    stdout.write('\x1b[?2026halternate buffer frame\x1b[?2026l');
    expect(writeSpy).toHaveBeenLastCalledWith(
      `${TMUX_ENTER_SYNCHRONIZED_OUTPUT_SEQ}alternate buffer frame${TMUX_EXIT_SYNCHRONIZED_OUTPUT_SEQ}`,
    );
  });

  it('skips synchronized output sequences on dumb terminals', async () => {
    vi.stubEnv('TMUX', '');
    vi.stubEnv('TERM', 'dumb');
    vi.resetModules();
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const { createWorkingStdio: createSyncStdio } = await import('./stdio.js');

    const { stdout } = createSyncStdio({ synchronizedOutput: true });
    stdout.write('dumb terminal output');
    expect(writeSpy).toHaveBeenLastCalledWith('dumb terminal output');
  });
});
