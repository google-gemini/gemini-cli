/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, expect, it } from 'vitest';
import { readStdinLines } from './readStdinLines.js';
import { PassThrough } from 'node:stream';

vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
}));

/** Helper: collect all values from the async generator. */
async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const results: string[] = [];
  for await (const line of gen) {
    results.push(line);
  }
  return results;
}

/** Helper: create a PassThrough stream and push lines into it. */
function createStream(lines: string[]): PassThrough {
  const stream = new PassThrough();
  for (const line of lines) {
    stream.write(line);
  }
  stream.end();
  return stream;
}

describe('readStdinLines', () => {
  it('should yield each non-empty line from piped input', async () => {
    const stream = createStream(['hello\n', 'world\n']);
    const result = await collect(readStdinLines(stream));
    expect(result).toEqual(['hello', 'world']);
  });

  it('should skip empty lines', async () => {
    const stream = createStream(['hello\n', '\n', '\n', 'world\n']);
    const result = await collect(readStdinLines(stream));
    expect(result).toEqual(['hello', 'world']);
  });

  it('should trim whitespace from lines', async () => {
    const stream = createStream(['  hello  \n', '  world  \n']);
    const result = await collect(readStdinLines(stream));
    expect(result).toEqual(['hello', 'world']);
  });

  it('should handle input without trailing newline', async () => {
    const stream = createStream(['hello\n', 'world']);
    const result = await collect(readStdinLines(stream));
    expect(result).toEqual(['hello', 'world']);
  });

  it('should yield nothing for empty stream', async () => {
    const stream = createStream([]);
    const result = await collect(readStdinLines(stream));
    expect(result).toEqual([]);
  });

  it('should handle multi-byte UTF-8 characters (CJK)', async () => {
    const stream = createStream(['한글 테스트\n', '日本語\n']);
    const result = await collect(readStdinLines(stream));
    expect(result).toEqual(['한글 테스트', '日本語']);
  });

  it('should handle emoji (4-byte UTF-8)', async () => {
    const stream = createStream(['hello 😀🎉\n', 'world 🚀\n']);
    const result = await collect(readStdinLines(stream));
    expect(result).toEqual(['hello 😀🎉', 'world 🚀']);
  });

  it('should handle chunks split across multiple writes', async () => {
    const stream = new PassThrough();
    stream.write('hel');
    stream.write('lo\nwor');
    stream.write('ld\n');
    stream.end();
    const result = await collect(readStdinLines(stream));
    expect(result).toEqual(['hello', 'world']);
  });

  it('should stop reading when total size exceeds cumulative limit', async () => {
    // Create lines that accumulate past the 8MB total limit.
    // Use a small stream with known byte sizes to verify the check fires.
    const oneMB = 'a'.repeat(1024 * 1024);
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(oneMB + '\n');
    }
    const stream = createStream(lines);
    const result = await collect(readStdinLines(stream));
    // 8 lines of ~1MB each should fit; the 9th should be rejected
    expect(result.length).toBeLessThanOrEqual(8);
    expect(result.length).toBeGreaterThanOrEqual(7);
  });

  it('should truncate oversized lines at valid UTF-8 boundary', async () => {
    // A line of ~9MB of 3-byte Korean characters
    const bigLine = '한'.repeat(3 * 1024 * 1024) + '\n'; // 9MB in UTF-8
    const stream = createStream([bigLine]);
    const result = await collect(readStdinLines(stream));
    expect(result.length).toBe(1);
    // The truncated line should be valid UTF-8 and <= 8MB
    const resultBytes = Buffer.byteLength(result[0], 'utf8');
    expect(resultBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    // Should not end with a broken character (no replacement chars)
    expect(result[0]).not.toContain('\uFFFD');
  });

  it('should handle oversized buffer without newline (flush path)', async () => {
    // Write >8MB without any newline to trigger the flush path
    const bigChunk = 'x'.repeat(9 * 1024 * 1024);
    const stream = createStream([bigChunk]);
    const result = await collect(readStdinLines(stream));
    expect(result.length).toBe(1);
    const resultBytes = Buffer.byteLength(result[0], 'utf8');
    expect(resultBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('should track totalSize consistently with post-truncation bytes', async () => {
    // A 9MB CJK line followed by a small line.
    // With post-truncation tracking, the truncated 8MB line leaves 0 budget,
    // so the second line should be dropped.
    const bigLine = '한'.repeat(3 * 1024 * 1024) + '\n'; // ~9MB UTF-8
    const smallLine = 'hello\n';
    const stream = createStream([bigLine, smallLine]);
    const result = await collect(readStdinLines(stream));
    // First line truncated to ~8MB, second should be dropped (totalSize exceeded)
    expect(result.length).toBe(1);
  });
});
