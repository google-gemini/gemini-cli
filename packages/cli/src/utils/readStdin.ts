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
  if (maxBytes <= 0) return '';
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
  if (
    process.stdin.isTTY ||
    process.stdin.destroyed ||
    process.stdin.readableEnded
  ) {
    return '';
  }

  const MAX_STDIN_SIZE = 8 * 1024 * 1024; // 8MB
  return new Promise((resolve, reject) => {
    let data = '';
    let totalSize = 0;
    let settled = false;
    process.stdin.setEncoding('utf8');

    const onReadable = () => {
      let chunk: unknown;
      while ((chunk = process.stdin.read()) !== null) {
        const chunkStr =
          typeof chunk === 'string'
            ? chunk
            : Buffer.isBuffer(chunk)
              ? chunk.toString('utf8')
              : String(chunk);
        const chunkByteLength = Buffer.byteLength(chunkStr, 'utf8');
        if (totalSize + chunkByteLength > MAX_STDIN_SIZE) {
          const remainingBytes = MAX_STDIN_SIZE - totalSize;
          data += truncateUtf8Bytes(chunkStr, remainingBytes);
          debugLogger.warn(
            `Warning: stdin input truncated to ${MAX_STDIN_SIZE} bytes.`,
          );
          cleanup();
          if (typeof process.stdin.unpipe === 'function') {
            process.stdin.unpipe();
          }
          if (typeof process.stdin.pause === 'function') {
            process.stdin.pause();
          }
          settled = true;
          resolve(data);
          break;
        }
        data += chunkStr;
        totalSize += chunkByteLength;
      }
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };

    const onError = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const cleanup = () => {
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
