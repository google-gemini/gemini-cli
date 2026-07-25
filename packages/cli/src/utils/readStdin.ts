/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';

/**
 * Truncates a string to fit within a UTF-8 byte limit without splitting
 * multi-byte characters. Walks back from the cut point to find the last
 * complete character boundary.
 */
function truncateUtf8Bytes(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  let end = maxBytes;
  // Walk backward past any UTF-8 continuation bytes (10xxxxxx)
  while (end > 0 && (buf[end] & 0xc0) === 0x80) {
    end--;
  }
  // end now points to the lead byte of an incomplete sequence — exclude it
  return buf.subarray(0, end).toString('utf8');
}

export async function readStdin(): Promise<string> {
  const MAX_STDIN_SIZE = 8 * 1024 * 1024; // 8MB
  return new Promise((resolve, reject) => {
    let data = '';
    let totalSize = 0;
    process.stdin.setEncoding('utf8');

    const pipedInputShouldBeAvailableInMs = 500;
    let pipedInputTimerId: null | NodeJS.Timeout = setTimeout(() => {
      // stop reading if input is not available yet, this is needed
      // in terminals where stdin is never TTY and nothing's piped
      // which causes the program to get stuck expecting data from stdin
      onEnd();
    }, pipedInputShouldBeAvailableInMs);

    const onReadable = () => {
      let chunk;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      while ((chunk = process.stdin.read()) !== null) {
        if (pipedInputTimerId) {
          clearTimeout(pipedInputTimerId);
          pipedInputTimerId = null;
        }

        const chunkByteLength = Buffer.byteLength(chunk, 'utf8');
        if (totalSize + chunkByteLength > MAX_STDIN_SIZE) {
          const remainingBytes = MAX_STDIN_SIZE - totalSize;
          data += truncateUtf8Bytes(chunk, remainingBytes);
          debugLogger.warn(
            `Warning: stdin input truncated to ${MAX_STDIN_SIZE} bytes.`,
          );
          process.stdin.destroy(); // Stop reading further
          onEnd();
          break;
        }
        data += chunk;
        totalSize += chunkByteLength;
      }
    };

    const onEnd = () => {
      cleanup();
      resolve(data);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      if (pipedInputTimerId) {
        clearTimeout(pipedInputTimerId);
        pipedInputTimerId = null;
      }
      process.stdin.removeListener('readable', onReadable);
      process.stdin.removeListener('end', onEnd);
      process.stdin.removeListener('error', onError);

      // Add a no-op error listener if no other error listeners are present to prevent
      // unhandled 'error' events (like EIO) from crashing the process after we stop reading.
      // This is especially important for background execution where TTY might cause EIO.
      if (process.stdin.listenerCount('error') === 0) {
        process.stdin.on('error', noopErrorHandler);
      }
    };

    process.stdin.on('readable', onReadable);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
  });
}

function noopErrorHandler() {}
