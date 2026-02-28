/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CoreEvent,
  type ConsoleLogPayload,
  coreEvents,
  type OutputPayload,
  type UserFeedbackPayload,
  writeToStderr,
  writeToStdout,
} from '@google/gemini-cli-core';

export function initializeOutputListenersAndFlush() {
  // If there are no listeners for output, make sure we flush so output is not
  // lost.
  if (coreEvents.listenerCount(CoreEvent.Output) === 0) {
    // In non-interactive mode, ensure we drain any buffered output or logs to stderr.
    coreEvents.on(CoreEvent.Output, (payload: OutputPayload) => {
      if (payload.isStderr) {
        writeToStderr(payload.chunk, payload.encoding);
      } else {
        writeToStdout(payload.chunk, payload.encoding);
      }
    });
  }

  if (coreEvents.listenerCount(CoreEvent.ConsoleLog) === 0) {
    coreEvents.on(CoreEvent.ConsoleLog, (payload: ConsoleLogPayload) => {
      if (payload.type === 'error' || payload.type === 'warn') {
        writeToStderr(payload.content);
      } else {
        writeToStdout(payload.content);
      }
    });
  }

  if (coreEvents.listenerCount(CoreEvent.UserFeedback) === 0) {
    coreEvents.on(CoreEvent.UserFeedback, (payload: UserFeedbackPayload) => {
      if (payload.severity === 'error' || payload.severity === 'warning') {
        writeToStderr(payload.message);
      } else {
        writeToStdout(payload.message);
      }
    });
  }
  coreEvents.drainBacklogs();
}
