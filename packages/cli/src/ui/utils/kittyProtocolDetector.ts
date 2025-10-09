/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

let detectionComplete = false;
let protocolSupported = false;
let protocolEnabled = false;

/**
 * Detects Kitty keyboard protocol support.
 * Definitive document about this protocol lives at https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 * This function should be called once at app startup.
 */
export async function detectAndEnableKittyProtocol(): Promise<boolean> {
  if (detectionComplete) {
    return protocolSupported;
  }

  return new Promise((resolve) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      detectionComplete = true;
      resolve(false);
      return;
    }

    const originalRawMode = process.stdin.isRaw;
    if (!originalRawMode) {
      process.stdin.setRawMode(true);
    }

    let responseBuffer = '';
    let progressiveEnhancementReceived = false;
    let timeoutId: NodeJS.Timeout | undefined;

    const onTimeout = () => {
      timeoutId = undefined;
      process.stdin.removeListener('data', handleData);
      if (!originalRawMode) {
        process.stdin.setRawMode(false);
      }
      detectionComplete = true;
      resolve(false);
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
        timeoutId = setTimeout(onTimeout, 1000);
      }

      // Check for device attributes response (CSI ? <attrs> c)
      if (responseBuffer.includes('\x1b[?') && responseBuffer.includes('c')) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
        process.stdin.removeListener('data', handleData);

        if (!originalRawMode) {
          process.stdin.setRawMode(false);
        }

        if (progressiveEnhancementReceived) {
          // Enable the protocol
          process.stdout.write('\x1b[>1u');
          protocolSupported = true;
          protocolEnabled = true;

          // Set up cleanup on exit
          process.on('exit', disableProtocol);
          process.on('SIGTERM', disableProtocol);
        }

        detectionComplete = true;
        resolve(protocolSupported);
      }
    };

    process.stdin.on('data', handleData);

    // Send queries
    process.stdout.write('\x1b[?u'); // Query progressive enhancement
    process.stdout.write('\x1b[c'); // Query device attributes

    // Timeout after 200ms
    // When a iterm2 terminal does not have focus this can take over 90s on a
    // fast macbook so we need a somewhat longer threshold than would be ideal.
    timeoutId = setTimeout(onTimeout, 200);
  });
}

function disableProtocol() {
  if (protocolEnabled) {
    process.stdout.write('\x1b[<u');
    protocolEnabled = false;
  }
}

export function isKittyProtocolEnabled(): boolean {
  return protocolEnabled;
}

export function isKittyProtocolSupported(): boolean {
  return protocolSupported;
}
