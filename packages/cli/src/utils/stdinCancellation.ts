/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import readline from 'node:readline';

const stdinCleanupSignals = [
  'SIGINT',
  'SIGTERM',
  'SIGHUP',
  'SIGBREAK',
  'SIGQUIT',
] as const;
const SIGINT_EXIT_CODE = 130;

type StdinCleanupSignal = (typeof stdinCleanupSignals)[number];

type KeypressHandler = (
  str: string,
  key: { name?: string; ctrl?: boolean },
) => void;

interface SetupStdinCancellationOptions {
  abortController: AbortController;
}

export function setupStdinCancellation({
  abortController,
}: SetupStdinCancellationOptions): () => void {
  let isAborting = false;
  let cancelMessageTimer: NodeJS.Timeout | null = null;
  let stdinWasRaw = false;
  let rl: readline.Interface | null = null;
  let stdinCancellationSetup = false;
  let keypressHandler: KeypressHandler | null = null;
  const signalHandlers = new Map<StdinCleanupSignal, () => void>();

  const cleanupStdinSignalHandlers = () => {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler);
    }
    signalHandlers.clear();
  };

  const cleanupStdinCancellation = () => {
    process.off('exit', cleanupStdinCancellation);
    cleanupStdinSignalHandlers();

    if (cancelMessageTimer) {
      clearTimeout(cancelMessageTimer);
      cancelMessageTimer = null;
    }

    if (rl) {
      rl.close();
      rl = null;
    }

    if (keypressHandler) {
      process.stdin.removeListener('keypress', keypressHandler);
      keypressHandler = null;
    }

    if (stdinCancellationSetup && process.stdin.isTTY) {
      process.stdin.setRawMode(stdinWasRaw);
      process.stdin.pause();
    }
    stdinCancellationSetup = false;
  };

  const abort = () => {
    if (isAborting) {
      return;
    }

    isAborting = true;

    cancelMessageTimer = setTimeout(() => {
      process.stderr.write('\nCancelling...\n');
    }, 200);

    if (!abortController.signal.aborted) {
      abortController.abort();
    }
  };

  const handleStdinCleanupSignal = () => {
    abort();
    cleanupStdinCancellation();
  };

  process.on('exit', cleanupStdinCancellation);

  if (!process.stdin.isTTY) {
    return cleanupStdinCancellation;
  }

  try {
    for (const signal of stdinCleanupSignals) {
      const handler = () => handleStdinCleanupSignal();
      signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }

    stdinWasRaw = process.stdin.isRaw || false;

    process.stdin.setRawMode(true);
    stdinCancellationSetup = true;
    process.stdin.resume();

    rl = readline.createInterface({
      input: process.stdin,
      escapeCodeTimeout: 0,
    });
    readline.emitKeypressEvents(process.stdin, rl);

    keypressHandler = (str, key) => {
      if ((key && key.ctrl && key.name === 'c') || str === '\u0003') {
        if (isAborting) {
          cleanupStdinCancellation();
          process.exit(SIGINT_EXIT_CODE);
        }
        abort();
      }
    };

    process.stdin.on('keypress', keypressHandler);
  } catch (error) {
    cleanupStdinCancellation();
    throw error;
  }

  return cleanupStdinCancellation;
}
