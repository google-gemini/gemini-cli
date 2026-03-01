/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';

/**
 * A shared event emitter for application-wide communication
 * between decoupled parts of the CLI.
 */
export const updateEventEmitter = new EventEmitter();

let _updateInProgress = false;

/**
 * Returns true if a background auto-update process is currently running.
 */
export function isUpdateInProgress(): boolean {
  return _updateInProgress;
}

/**
 * Sets the update-in-progress flag. Called by handleAutoUpdate when the
 * background update process is spawned and when it completes.
 */
export function setUpdateInProgress(inProgress: boolean): void {
  _updateInProgress = inProgress;
}

/**
 * Default timeout (in ms) to wait for an in-progress update before
 * proceeding with relaunch. Prevents hanging indefinitely.
 */
export const UPDATE_WAIT_TIMEOUT_MS = 30_000;

/**
 * If an auto-update is in progress, returns a promise that resolves when the
 * update finishes (success or failure) or when the timeout expires.
 * If no update is in progress, resolves immediately.
 */
export function waitForUpdateCompletion(
  timeoutMs: number = UPDATE_WAIT_TIMEOUT_MS,
): Promise<void> {
  if (!_updateInProgress) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const onDone = () => {
      clearTimeout(timer);
      updateEventEmitter.removeListener('update-success', onDone);
      updateEventEmitter.removeListener('update-failed', onDone);
      resolve();
    };

    const timer = setTimeout(onDone, timeoutMs);

    updateEventEmitter.once('update-success', onDone);
    updateEventEmitter.once('update-failed', onDone);
  });
}
