/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';

/**
 * Reads piped stdin line-by-line as an async generator.
 *
 * Safety limits matching readStdin():
 * - Per-line: 8MB (truncates lines exceeding this)
 * - Total session: 8MB cumulative (stops reading when exceeded)
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
      totalSize += line.length;
      if (totalSize > MAX_TOTAL_SIZE) {
        debugLogger.warn(
          `Total piped input exceeds ${MAX_TOTAL_SIZE} bytes, stopping.`,
        );
        return;
      }
      yield line.length > MAX_LINE_SIZE ? line.slice(0, MAX_LINE_SIZE) : line;
    }
    // Flush buffer if it exceeds per-line limit without a newline
    if (buffer.length > MAX_LINE_SIZE) {
      debugLogger.warn(
        `Stdin line exceeds ${MAX_LINE_SIZE} bytes, truncating.`,
      );
      const line = buffer.slice(0, MAX_LINE_SIZE).trim();
      buffer = '';
      if (line) {
        totalSize += line.length;
        if (totalSize > MAX_TOTAL_SIZE) return;
        yield line;
      }
    }
  }
  // Flush remaining buffer after EOF
  const remaining = buffer.trim();
  if (remaining && totalSize + remaining.length <= MAX_TOTAL_SIZE) {
    yield remaining.length > MAX_LINE_SIZE
      ? remaining.slice(0, MAX_LINE_SIZE)
      : remaining;
  }
}
