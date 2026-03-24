/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  LOOP_COMMAND_USAGE,
  MAX_LOOP_INTERVAL_MINUTES,
  LOOP_STOP_MARKER,
  buildLoopSubmissionText,
  consumeLoopStopMarkerDelta,
  createActiveLoopStopMatchState,
  createInactiveLoopStopMatchState,
  flushLoopStopMarkerState,
  parseLoopCommandArgs,
} from './loopCommand.js';

describe('loopCommand utils', () => {
  it('parses strict minute-based loop arguments', () => {
    expect(parseLoopCommandArgs('5m continue')).toEqual({
      intervalMs: 300_000,
      intervalSpec: '5m',
      prompt: 'continue',
    });
  });

  it('rejects invalid loop arguments', () => {
    expect(() => parseLoopCommandArgs('')).toThrow(LOOP_COMMAND_USAGE);
    expect(() => parseLoopCommandArgs('5 continue')).toThrow(
      LOOP_COMMAND_USAGE,
    );
    expect(() => parseLoopCommandArgs('0m continue')).toThrow(
      'Loop interval must be a positive whole number of minutes, e.g. 5m.',
    );
    expect(() => parseLoopCommandArgs('5m')).toThrow(LOOP_COMMAND_USAGE);
  });

  it('rejects intervals larger than setInterval supports', () => {
    expect(() =>
      parseLoopCommandArgs(`${MAX_LOOP_INTERVAL_MINUTES + 1}m continue`),
    ).toThrow(`Loop interval must be ${MAX_LOOP_INTERVAL_MINUTES}m or less.`);
  });

  it('builds the hidden loop submission text', () => {
    const submission = buildLoopSubmissionText('continue');
    expect(submission).toContain('This message was automatically queued');
    expect(submission).toContain(LOOP_STOP_MARKER);
    expect(submission).toContain('Scheduled prompt:\ncontinue');
  });

  it('passes through content for non-loop turns', () => {
    const result = consumeLoopStopMarkerDelta(
      'Normal response',
      createInactiveLoopStopMatchState(),
    );

    expect(result.visibleDelta).toBe('Normal response');
    expect(result.shouldCancel).toBe(false);
  });

  it('detects a split loop stop marker and strips it from visible output', () => {
    let state = createActiveLoopStopMatchState();

    const first = consumeLoopStopMarkerDelta('[[GEMINI_', state);
    state = first.nextState;
    expect(first.visibleDelta).toBeNull();
    expect(first.shouldCancel).toBe(false);

    const second = consumeLoopStopMarkerDelta(
      'LOOP_DONE]]  Loop removed because the task is finished.',
      state,
    );
    expect(second.shouldCancel).toBe(true);
    expect(second.visibleDelta).toBe(
      'Loop removed because the task is finished.',
    );
  });

  it('flushes an incomplete marker buffer back into visible output', () => {
    const pending = consumeLoopStopMarkerDelta(
      '[[GEMINI_',
      createActiveLoopStopMatchState(),
    );

    const flushed = flushLoopStopMarkerState(pending.nextState);
    expect(flushed.visibleDelta).toBe('[[GEMINI_');
  });
});
