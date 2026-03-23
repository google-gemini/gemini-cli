/**
 * @license
 * Copyright 2026 Google LLC
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

/**
 * Reads piped stdin line-by-line as an async generator.
 *
 * Safety limits matching readStdin():
 * - Per-line: 8MB (truncates lines exceeding this)
 * - Total session: 8MB cumulative (stops reading when exceeded)
 *
 * Size tracking uses Buffer.byteLength for accurate UTF-8 byte
 * measurement. Truncation uses truncateUtf8Bytes to avoid splitting
 * multi-byte characters (e.g. CJK, emoji).
 *
 * Reads raw chunks instead of using readline.createInterface to enforce
 * size caps during buffering and prevent OOM from input without newline
 * delimiters.
 */
export async function* readStdinLines(
  stream: NodeJS.ReadableStream = process.stdin,
): AsyncGenerator<string> {
  const MAX_LINE_SIZE = 8 * 1024 * 1024; // 8MB per line
  const MAX_TOTAL_SIZE = 8 * 1024 * 1024; // 8MB cumulative
  let buffer = '';
  let totalSize = 0;
  stream.setEncoding('utf8');
  for await (const chunk of stream) {
    buffer += chunk;
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;
      const lineBytes = Buffer.byteLength(line, 'utf8');
      const truncated =
        lineBytes > MAX_LINE_SIZE
          ? truncateUtf8Bytes(line, MAX_LINE_SIZE)
          : line;
      const yieldBytes =
        truncated === line ? lineBytes : Buffer.byteLength(truncated, 'utf8');
      totalSize += yieldBytes;
      if (totalSize > MAX_TOTAL_SIZE) {
        debugLogger.warn(
          `Total piped input exceeds ${MAX_TOTAL_SIZE} bytes, stopping.`,
        );
        return;
      }
      yield truncated;
    }
    // Flush buffer if it exceeds per-line limit without a newline
    if (Buffer.byteLength(buffer, 'utf8') > MAX_LINE_SIZE) {
      debugLogger.warn(
        `Stdin line exceeds ${MAX_LINE_SIZE} bytes, truncating.`,
      );
      const line = truncateUtf8Bytes(buffer.trim(), MAX_LINE_SIZE);
      buffer = '';
      if (line) {
        totalSize += Buffer.byteLength(line, 'utf8');
        if (totalSize > MAX_TOTAL_SIZE) return;
        yield line;
      }
    }
  }
  // Flush remaining buffer after EOF
  const remaining = buffer.trim();
  if (remaining) {
    const remainingBytes = Buffer.byteLength(remaining, 'utf8');
    if (totalSize + remainingBytes <= MAX_TOTAL_SIZE) {
      yield remainingBytes > MAX_LINE_SIZE
        ? truncateUtf8Bytes(remaining, MAX_LINE_SIZE)
        : remaining;
    }
  }
}
