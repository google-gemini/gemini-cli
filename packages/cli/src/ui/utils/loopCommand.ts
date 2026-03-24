/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoopSchedule } from '../commands/types.js';

export const LOOP_COMMAND_USAGE = 'Usage: /loop <interval Xm> <message>';
export const LOOP_STOP_MARKER = '[[GEMINI_LOOP_DONE]]';
export const MAX_LOOP_INTERVAL_MS = 2_147_483_647;
export const MAX_LOOP_INTERVAL_MINUTES = Math.floor(
  MAX_LOOP_INTERVAL_MS / 60_000,
);

export interface LoopStopMatchStateInactive {
  kind: 'inactive';
}

export interface LoopStopMatchStatePending {
  kind: 'pending';
  buffer: string;
}

export interface LoopStopMatchStateMatched {
  kind: 'matched';
  trimLeadingWhitespace: boolean;
}

export interface LoopStopMatchStatePassthrough {
  kind: 'passthrough';
}

export type LoopStopMatchState =
  | LoopStopMatchStateInactive
  | LoopStopMatchStatePending
  | LoopStopMatchStateMatched
  | LoopStopMatchStatePassthrough;

export function createActiveLoopStopMatchState(): LoopStopMatchState {
  return { kind: 'pending', buffer: '' };
}

export function createInactiveLoopStopMatchState(): LoopStopMatchState {
  return { kind: 'inactive' };
}

export function parseLoopCommandArgs(args: string): LoopSchedule {
  const trimmed = args.trim();
  const match = /^(\d+)m(?:\s+([\s\S]*\S))?$/.exec(trimmed);

  if (!match) {
    throw new Error(LOOP_COMMAND_USAGE);
  }

  const minutes = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    throw new Error(
      'Loop interval must be a positive whole number of minutes, e.g. 5m.',
    );
  }
  if (minutes > MAX_LOOP_INTERVAL_MINUTES) {
    throw new Error(
      `Loop interval must be ${MAX_LOOP_INTERVAL_MINUTES}m or less.`,
    );
  }

  const prompt = match[2]?.trim();
  if (!prompt) {
    throw new Error(LOOP_COMMAND_USAGE);
  }

  return {
    intervalMs: minutes * 60_000,
    intervalSpec: `${minutes}m`,
    prompt,
  };
}

export function buildLoopSubmissionText(prompt: string): string {
  return (
    `This message was automatically queued by \`/loop\`.\n` +
    `Interpret the scheduled prompt below in the current conversation context and continue the work if more remains.\n` +
    `If the work is already fully complete and there is truly nothing left to do, start your next assistant message with \`${LOOP_STOP_MARKER}\` and then briefly explain that the loop has been removed because the task is finished.\n` +
    `Do not include \`${LOOP_STOP_MARKER}\` unless the loop should be removed.\n\n` +
    `Scheduled prompt:\n${prompt}`
  );
}

export function consumeLoopStopMarkerDelta(
  delta: string,
  state: LoopStopMatchState,
): {
  nextState: LoopStopMatchState;
  visibleDelta: string | null;
  shouldCancel: boolean;
} {
  if (delta.length === 0) {
    return { nextState: state, visibleDelta: null, shouldCancel: false };
  }

  if (state.kind === 'inactive' || state.kind === 'passthrough') {
    return { nextState: state, visibleDelta: delta, shouldCancel: false };
  }

  if (state.kind === 'matched') {
    if (!state.trimLeadingWhitespace) {
      return {
        nextState: state,
        visibleDelta: delta,
        shouldCancel: false,
      };
    }

    const trimmed = delta.replace(/^\s+/, '');
    return {
      nextState: {
        kind: 'matched',
        trimLeadingWhitespace: trimmed.length === 0,
      },
      visibleDelta: trimmed.length > 0 ? trimmed : null,
      shouldCancel: false,
    };
  }

  const combined = state.buffer + delta;
  if (combined.startsWith(LOOP_STOP_MARKER)) {
    const remainder = combined.slice(LOOP_STOP_MARKER.length);
    const trimmed = remainder.replace(/^\s+/, '');
    return {
      nextState: {
        kind: 'matched',
        trimLeadingWhitespace: trimmed.length === 0,
      },
      visibleDelta: trimmed.length > 0 ? trimmed : null,
      shouldCancel: true,
    };
  }

  if (LOOP_STOP_MARKER.startsWith(combined)) {
    return {
      nextState: { kind: 'pending', buffer: combined },
      visibleDelta: null,
      shouldCancel: false,
    };
  }

  return {
    nextState: { kind: 'passthrough' },
    visibleDelta: combined,
    shouldCancel: false,
  };
}

export function flushLoopStopMarkerState(state: LoopStopMatchState): {
  nextState: LoopStopMatchState;
  visibleDelta: string | null;
} {
  if (state.kind !== 'pending' || state.buffer.length === 0) {
    return { nextState: state, visibleDelta: null };
  }

  return {
    nextState: { kind: 'passthrough' },
    visibleDelta: state.buffer,
  };
}
