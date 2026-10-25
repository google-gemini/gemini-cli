/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamingState } from '../ui/types.js';
import {
  createProgramStatusWriter,
  encodeProgramStatusMsg,
  formatProgramStatusSequence,
  getProgramStatusBlockedKind,
  inferTurnOutcome,
  mapAppStateToProgramStatus,
  MAX_MSG_DECODED_BYTES,
  PROGRAM_STATUS_APP,
  shouldEmitProgramStatus,
  truncateProgramStatusMsgUtf8,
  USER_CANCELLED_MESSAGE,
} from './programStatus.js';
import { wrapForTmux, wrapOscForMultiplexer } from './oscPassthrough.js';

const writeToStdout = vi.hoisted(() => vi.fn());
const debugLogger = vi.hoisted(() => ({
  debug: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', () => ({
  writeToStdout,
  debugLogger,
}));

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('shouldEmitProgramStatus', () => {
  it('is enabled for interactive TTY text sessions', () => {
    expect(
      shouldEmitProgramStatus({
        enabled: true,
        isInteractive: true,
        stdoutIsTTY: true,
        outputFormat: 'text',
        acpMode: false,
      }),
    ).toBe(true);
  });

  it('defaults the setting to on', () => {
    expect(
      shouldEmitProgramStatus({
        isInteractive: true,
        stdoutIsTTY: true,
      }),
    ).toBe(true);
  });

  it('honors the off switch', () => {
    expect(
      shouldEmitProgramStatus({
        enabled: false,
        isInteractive: true,
        stdoutIsTTY: true,
        outputFormat: 'text',
      }),
    ).toBe(false);
  });

  it.each([
    {
      name: 'non-interactive',
      options: {
        isInteractive: false,
        stdoutIsTTY: true,
        outputFormat: 'text',
      },
    },
    {
      name: 'non-TTY stdout',
      options: {
        isInteractive: true,
        stdoutIsTTY: false,
        outputFormat: 'text',
      },
    },
    {
      name: 'json output',
      options: {
        isInteractive: true,
        stdoutIsTTY: true,
        outputFormat: 'json',
      },
    },
    {
      name: 'stream-json output',
      options: {
        isInteractive: true,
        stdoutIsTTY: true,
        outputFormat: 'stream-json',
      },
    },
    {
      name: 'ACP',
      options: {
        isInteractive: true,
        stdoutIsTTY: true,
        outputFormat: 'text',
        acpMode: true,
      },
    },
  ])('never emits for $name', ({ options }) => {
    expect(shouldEmitProgramStatus(options)).toBe(false);
  });
});

describe('non-interactive paths never write OSC 7501', () => {
  it('does not import program status from non-interactive or ACP entrypoints', () => {
    const nonInteractive = readFileSync(
      join(SRC_DIR, 'nonInteractiveCli.ts'),
      'utf8',
    );
    const acpEntrypoint = readFileSync(
      join(SRC_DIR, 'acp/acpStdioTransport.ts'),
      'utf8',
    );

    expect(nonInteractive).not.toContain('programStatus');
    expect(nonInteractive).not.toContain('7501');
    expect(acpEntrypoint).not.toContain('programStatus');
    expect(acpEntrypoint).not.toContain('7501');
  });
});

describe('mapAppStateToProgramStatus', () => {
  it('maps responding to working', () => {
    expect(
      mapAppStateToProgramStatus({
        streamingState: StreamingState.Responding,
      }),
    ).toEqual({ state: 'working', msg: 'Responding' });
  });

  it('maps startup idle to idle', () => {
    expect(
      mapAppStateToProgramStatus({
        streamingState: StreamingState.Idle,
      }),
    ).toEqual({ state: 'idle' });
  });

  it('maps a finished turn to done', () => {
    expect(
      mapAppStateToProgramStatus({
        streamingState: StreamingState.Idle,
        lastTurnOutcome: 'success',
      }),
    ).toEqual({ state: 'done', msg: 'Turn complete' });
  });

  it('maps a failed turn to error', () => {
    expect(
      mapAppStateToProgramStatus({
        streamingState: StreamingState.Idle,
        lastTurnOutcome: 'error',
      }),
    ).toEqual({ state: 'error', msg: 'Turn failed' });
  });

  it('maps a cancelled turn to idle', () => {
    expect(
      mapAppStateToProgramStatus({
        streamingState: StreamingState.Idle,
        lastTurnOutcome: 'cancelled',
      }),
    ).toEqual({ state: 'idle' });
  });

  it('maps init errors to error while idle', () => {
    expect(
      mapAppStateToProgramStatus({
        streamingState: StreamingState.Idle,
        initError: 'Failed to start',
      }),
    ).toEqual({ state: 'error', msg: 'Failed to start' });
  });

  it('prefers blocked over working', () => {
    expect(
      mapAppStateToProgramStatus({
        streamingState: StreamingState.Responding,
        blockedKind: 'permission',
      }),
    ).toEqual({
      state: 'blocked',
      kind: 'permission',
      msg: 'Waiting for approval',
    });
  });

  it.each([
    ['permission', 'Waiting for approval'],
    ['question', 'Waiting for a response'],
    ['auth', 'Waiting for authentication'],
  ] as const)('maps blocked kind %s', (kind, msg) => {
    expect(
      mapAppStateToProgramStatus({
        streamingState: StreamingState.WaitingForConfirmation,
        blockedKind: kind,
      }),
    ).toEqual({ state: 'blocked', kind, msg });
  });
});

describe('getProgramStatusBlockedKind', () => {
  it('prefers auth over question and permission', () => {
    expect(
      getProgramStatusBlockedKind({
        authRequired: true,
        questionRequired: true,
        permissionRequired: true,
      }),
    ).toBe('auth');
  });

  it('prefers question over permission', () => {
    expect(
      getProgramStatusBlockedKind({
        authRequired: false,
        questionRequired: true,
        permissionRequired: true,
      }),
    ).toBe('question');
  });

  it('returns permission when that is the only blocker', () => {
    expect(
      getProgramStatusBlockedKind({
        authRequired: false,
        questionRequired: false,
        permissionRequired: true,
      }),
    ).toBe('permission');
  });

  it('returns undefined when nothing is blocked', () => {
    expect(
      getProgramStatusBlockedKind({
        authRequired: false,
        questionRequired: false,
        permissionRequired: false,
      }),
    ).toBeUndefined();
  });
});

describe('inferTurnOutcome', () => {
  it('returns error when initError is set', () => {
    expect(inferTurnOutcome([], 'boom')).toBe('error');
  });

  it('returns error for the latest error history item', () => {
    expect(
      inferTurnOutcome(
        [
          { type: 'user', text: 'hi' },
          { type: 'error', text: 'api failed' },
        ],
        null,
      ),
    ).toBe('error');
  });

  it('returns cancelled for a user cancel message', () => {
    expect(
      inferTurnOutcome(
        [
          { type: 'user', text: 'hi' },
          { type: 'info', text: USER_CANCELLED_MESSAGE },
        ],
        null,
      ),
    ).toBe('cancelled');
  });

  it('returns success for a completed model turn', () => {
    expect(
      inferTurnOutcome(
        [
          { type: 'user', text: 'hi' },
          { type: 'gemini', text: 'hello' },
        ],
        null,
      ),
    ).toBe('success');
  });
});

describe('formatProgramStatusSequence', () => {
  it('emits OSC 7501 with a stable app name', () => {
    const sequence = formatProgramStatusSequence({
      state: 'working',
      msg: 'Responding',
    });

    expect(sequence.startsWith('\x1b]7501;')).toBe(true);
    expect(sequence.endsWith('\x1b\\')).toBe(true);
    expect(sequence).toContain(`app=${PROGRAM_STATUS_APP}`);
    expect(sequence).toContain('state=working');
    expect(sequence).toContain(`msg=${encodeProgramStatusMsg('Responding')}`);
  });

  it('includes blocked kind and omits app on clear', () => {
    expect(
      formatProgramStatusSequence({
        state: 'blocked',
        kind: 'permission',
        msg: 'Waiting for approval',
      }),
    ).toContain('state=blocked:kind=permission:app=gemini');

    expect(formatProgramStatusSequence({ state: 'clear' })).toBe(
      '\x1b]7501;state=clear\x1b\\',
    );
  });

  it('encodes msg as base64 without control characters', () => {
    const encoded = encodeProgramStatusMsg('Apply 3 changes?\n');
    expect(encoded).toBe(
      Buffer.from('Apply 3 changes?', 'utf8').toString('base64'),
    );
    expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('truncates multi-byte text on grapheme boundaries within the byte limit', () => {
    const cjk = '中'; // 3 UTF-8 bytes; 2048 % 3 === 2, so a raw byte slice would split
    const encoded = encodeProgramStatusMsg(cjk.repeat(1000));
    const raw = Buffer.from(encoded, 'base64');
    const decoded = raw.toString('utf8');

    expect(raw.length).toBeLessThanOrEqual(MAX_MSG_DECODED_BYTES);
    expect(raw.length).toBe(Math.floor(MAX_MSG_DECODED_BYTES / 3) * 3);
    expect(decoded).not.toContain('\uFFFD');
    expect(decoded).toBe(cjk.repeat(Math.floor(MAX_MSG_DECODED_BYTES / 3)));
    expect(Buffer.from(decoded, 'utf8').equals(raw)).toBe(true);
  });

  it('drops a grapheme that would exceed the byte limit instead of splitting it', () => {
    const family = '👨‍👩‍👧‍👦';
    const familyBytes = Buffer.byteLength(family, 'utf8');
    const filler = 'a'.repeat(MAX_MSG_DECODED_BYTES - familyBytes + 1);
    const truncated = truncateProgramStatusMsgUtf8(
      filler + family,
      MAX_MSG_DECODED_BYTES,
    );

    expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(
      MAX_MSG_DECODED_BYTES,
    );
    expect(truncated).toBe(filler);
    expect(truncated).not.toContain('\uFFFD');

    const encoded = encodeProgramStatusMsg(filler + family);
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(filler);
  });
});

describe('createProgramStatusWriter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('de-duplicates identical reports', () => {
    const write = vi.fn();
    const writer = createProgramStatusWriter(write);

    writer.report({ state: 'working', msg: 'Responding' });
    writer.report({ state: 'working', msg: 'Responding' });
    writer.report({ state: 'idle' });

    expect(write).toHaveBeenCalledTimes(2);
    expect(String(write.mock.calls[0][0])).toContain('state=working');
    expect(String(write.mock.calls[1][0])).toContain('state=idle');
  });

  it('emits idle then clear on close, and ignores a second close', () => {
    const write = vi.fn();
    const writer = createProgramStatusWriter(write);

    writer.report({ state: 'working', msg: 'Responding' });
    writer.close();
    writer.close();

    expect(write).toHaveBeenCalledTimes(3);
    expect(String(write.mock.calls[1][0])).toContain('state=idle');
    expect(String(write.mock.calls[2][0])).toBe('\x1b]7501;state=clear\x1b\\');
  });

  it('wraps sequences for tmux passthrough', () => {
    vi.stubEnv('TMUX', '1');
    const write = vi.fn();
    const writer = createProgramStatusWriter(write);
    const report = { state: 'idle' as const };

    writer.report(report);

    const emitted = String(write.mock.calls[0][0]);
    expect(emitted).toBe(wrapForTmux(formatProgramStatusSequence(report)));
    expect(emitted.startsWith('\x1bPtmux;')).toBe(true);
    expect(emitted).toContain('\x1b\x1b]7501;');
  });

  it('uses the default stdout writer and swallows write failures', () => {
    writeToStdout.mockImplementation(() => {
      throw new Error('no permissions');
    });

    const writer = createProgramStatusWriter();
    expect(() => writer.report({ state: 'idle' })).not.toThrow();
    expect(writeToStdout).toHaveBeenCalledTimes(1);
    expect(debugLogger.debug).toHaveBeenCalledTimes(1);
  });
});

describe('wrapOscForMultiplexer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the sequence unchanged outside multiplexers', () => {
    vi.stubEnv('TMUX', '');
    vi.stubEnv('STY', '');
    vi.stubEnv('TERM', 'xterm-256color');
    expect(wrapOscForMultiplexer('\x1b]7501;state=idle\x1b\\')).toBe(
      '\x1b]7501;state=idle\x1b\\',
    );
  });
});
