/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';

let detectionComplete = false;

let kittySupported = false;
let sgrMouseSupported = false;

let kittyEnabled = false;
let sgrMouseEnabled = false;

/**
 * Detects Kitty keyboard protocol support.
 * Definitive document about this protocol lives at https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 * This function should be called once at app startup.
 */
export async function detectAndEnableKittyProtocol(): Promise<void> {
  if (detectionComplete) {
    return;
  }

  return new Promise((resolve) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      detectionComplete = true;
      resolve();
      return;
    }

    const originalRawMode = process.stdin.isRaw;
    if (!originalRawMode) {
      process.stdin.setRawMode(true);
    }

    let responseBuffer = '';
    let progressiveEnhancementReceived = false;
    let timeoutId: NodeJS.Timeout | undefined;

    const finish = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      process.stdin.removeListener('data', handleData);
      if (!originalRawMode) {
        process.stdin.setRawMode(false);
      }

      if (kittySupported || sgrMouseSupported) {
        enableSupportedProtocol();
        process.on('exit', disableAllProtocols);
        process.on('SIGTERM', disableAllProtocols);
      }

      detectionComplete = true;
      resolve();
    };

    const handleData = (data: Buffer) => {
      if (timeoutId === undefined) {
        // Race condition. We have already timed out.
        return;
      }
      responseBuffer += data.toString();

      // Check for progressive enhancement response (CSI ? <flags> u)
      if (responseBuffer.includes('\x1b[?') && responseBuffer.includes('u')) {
        progressiveEnhancementReceived = true;
        // Give more time to get the full set of kitty responses if we have an
        // indication the terminal probably supports kitty and we just need to
        // wait a bit longer for a response.
        clearTimeout(timeoutId);
        timeoutId = setTimeout(finish, 1000);
      }

      // Check for device attributes response (CSI ? <attrs> c)
      if (responseBuffer.includes('\x1b[?') && responseBuffer.includes('c')) {
        if (progressiveEnhancementReceived) {
          kittySupported = true;
        }

        // Broaden mouse support by enabling SGR mode if we get any device
        // attribute response, which is a strong signal of a modern terminal.
        sgrMouseSupported = true;

        finish();
      }
    };

    process.stdin.on('data', handleData);

    // Query progressive enhancement and device attributes
    fs.writeSync(process.stdout.fd, '\x1b[?u\x1b[c');

    // Timeout after 200ms
    // When a iterm2 terminal does not have focus this can take over 90s on a
    // fast macbook so we need a somewhat longer threshold than would be ideal.
    timeoutId = setTimeout(finish, 200);
  });
}

export function isKittyProtocolEnabled(): boolean {
  return kittyEnabled;
}

function disableAllProtocols() {
  try {
    if (kittyEnabled) {
      fs.writeSync(process.stdout.fd, '\x1b[<u');
      kittyEnabled = false;
    }
    if (sgrMouseEnabled) {
      fs.writeSync(process.stdout.fd, '\x1b[?1006l');
      sgrMouseEnabled = false;
    }
  } catch {
    // Ignore
  }
}

/**
 * This is exported so we can reenable this after exiting an editor which might
 * change the mode.
 */
export function enableSupportedProtocol(): void {
  try {
    if (kittySupported) {
      fs.writeSync(process.stdout.fd, '\x1b[>1u');
      kittyEnabled = true;
    }
    if (sgrMouseSupported) {
      fs.writeSync(process.stdout.fd, '\x1b[?1006h');
      sgrMouseEnabled = true;
    }
  } catch {
    // Ignore
  }
}
