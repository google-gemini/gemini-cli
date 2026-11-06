/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, writeToStdout } from '@google/gemini-cli-core';
import { StreamingState } from '../ui/types.js';
import { wrapOscForMultiplexer } from './oscPassthrough.js';

export const PROGRAM_STATUS_APP = 'gemini';
export const USER_CANCELLED_MESSAGE = 'User cancelled the request.';
export const MAX_MSG_DECODED_BYTES = 2048;

const OSC_7501_PREFIX = '\x1b]7501;';
const ST = '\x1b\\';
const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

export type ProgramStatusState =
  | 'idle'
  | 'working'
  | 'done'
  | 'error'
  | 'blocked'
  | 'clear';

export type ProgramStatusBlockedKind = 'permission' | 'question' | 'auth';

export type TurnOutcome = 'success' | 'error' | 'cancelled';

export interface ProgramStatusReport {
  state: ProgramStatusState;
  kind?: ProgramStatusBlockedKind;
  msg?: string;
}

export interface ProgramStatusAppState {
  streamingState: StreamingState;
  blockedKind?: ProgramStatusBlockedKind;
  lastTurnOutcome?: TurnOutcome | null;
  initError?: string | null;
}

export interface ShouldEmitProgramStatusOptions {
  enabled?: boolean;
  isInteractive: boolean;
  stdoutIsTTY: boolean;
  outputFormat?: string;
  acpMode?: boolean;
}

export interface HistoryItemLike {
  type: string;
  text?: string;
}

export function shouldEmitProgramStatus(
  options: ShouldEmitProgramStatusOptions,
): boolean {
  if (options.enabled === false) {
    return false;
  }
  if (!options.isInteractive) {
    return false;
  }
  if (!options.stdoutIsTTY) {
    return false;
  }
  if (options.acpMode) {
    return false;
  }
  if (options.outputFormat !== undefined && options.outputFormat !== 'text') {
    return false;
  }
  return true;
}

export function getProgramStatusBlockedKind(flags: {
  authRequired: boolean;
  questionRequired: boolean;
  permissionRequired: boolean;
}): ProgramStatusBlockedKind | undefined {
  if (flags.authRequired) {
    return 'auth';
  }
  if (flags.questionRequired) {
    return 'question';
  }
  if (flags.permissionRequired) {
    return 'permission';
  }
  return undefined;
}

export function inferTurnOutcome(
  history: readonly HistoryItemLike[],
  initError: string | null,
): TurnOutcome {
  if (initError) {
    return 'error';
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    switch (item.type) {
      case 'error':
        return 'error';
      case 'info':
        if (item.text === USER_CANCELLED_MESSAGE) {
          return 'cancelled';
        }
        continue;
      case 'user':
        return 'cancelled';
      case 'gemini':
      case 'gemini_content':
      case 'tool_group':
        return 'success';
      default:
        continue;
    }
  }

  return 'success';
}

export function mapAppStateToProgramStatus(
  state: ProgramStatusAppState,
): ProgramStatusReport {
  if (state.blockedKind) {
    return {
      state: 'blocked',
      kind: state.blockedKind,
      msg: blockedMessage(state.blockedKind),
    };
  }

  if (state.streamingState === StreamingState.Responding) {
    return { state: 'working', msg: 'Responding' };
  }

  if (state.initError) {
    return { state: 'error', msg: sanitizeProgramStatusMsg(state.initError) };
  }

  if (state.lastTurnOutcome === 'error') {
    return { state: 'error', msg: 'Turn failed' };
  }

  if (state.lastTurnOutcome === 'success') {
    return { state: 'done', msg: 'Turn complete' };
  }

  return { state: 'idle' };
}

export function formatProgramStatusSequence(
  report: ProgramStatusReport,
): string {
  const pairs: string[] = [`state=${report.state}`];

  if (report.state === 'blocked' && report.kind) {
    pairs.push(`kind=${report.kind}`);
  }

  if (report.state !== 'clear') {
    pairs.push(`app=${PROGRAM_STATUS_APP}`);
  }

  if (report.msg && report.state !== 'clear') {
    const msg = encodeProgramStatusMsg(report.msg);
    if (msg) {
      pairs.push(`msg=${msg}`);
    }
  }

  return `${OSC_7501_PREFIX}${pairs.join(':')}${ST}`;
}

export function sanitizeProgramStatusMsg(text: string): string {
  let sanitized = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
      continue;
    }
    sanitized += char;
  }
  return sanitized.trim();
}

/** Truncate to `maxBytes` of UTF-8 without splitting a grapheme cluster. */
export function truncateProgramStatusMsgUtf8(
  text: string,
  maxBytes: number = MAX_MSG_DECODED_BYTES,
): string {
  if (maxBytes <= 0 || text.length === 0) {
    return '';
  }
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return text;
  }

  let accumulatedBytes = 0;
  let truncated = '';
  for (const { segment } of graphemeSegmenter.segment(text)) {
    const segmentBytes = Buffer.byteLength(segment, 'utf8');
    if (accumulatedBytes + segmentBytes > maxBytes) {
      break;
    }
    accumulatedBytes += segmentBytes;
    truncated += segment;
  }
  return truncated;
}

export function encodeProgramStatusMsg(text: string): string {
  const sanitized = sanitizeProgramStatusMsg(text);
  if (!sanitized) {
    return '';
  }
  return Buffer.from(
    truncateProgramStatusMsgUtf8(sanitized, MAX_MSG_DECODED_BYTES),
    'utf8',
  ).toString('base64');
}

export interface ProgramStatusWriter {
  report: (status: ProgramStatusReport) => void;
  close: () => void;
}

export function createProgramStatusWriter(
  write: (payload: string) => void = writeProgramStatusToStdout,
): ProgramStatusWriter {
  let lastPayload: string | null = null;
  let closed = false;

  const emit = (status: ProgramStatusReport): void => {
    const sequence = formatProgramStatusSequence(status);
    if (sequence === lastPayload) {
      return;
    }
    lastPayload = sequence;
    try {
      write(wrapOscForMultiplexer(sequence));
    } catch (error) {
      debugLogger.debug('Failed to emit program status:', error);
    }
  };

  return {
    report(status: ProgramStatusReport): void {
      closed = false;
      emit(status);
    },
    close(): void {
      if (closed) {
        return;
      }
      closed = true;
      emit({ state: 'idle' });
      emit({ state: 'clear' });
    },
  };
}

function writeProgramStatusToStdout(payload: string): void {
  writeToStdout(payload);
}

function blockedMessage(kind: ProgramStatusBlockedKind): string {
  switch (kind) {
    case 'permission':
      return 'Waiting for approval';
    case 'question':
      return 'Waiting for a response';
    case 'auth':
      return 'Waiting for authentication';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
