/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { execStreaming } from './shell-utils.js';

// Integration tests using real child processes
describe('execStreaming (Integration)', () => {
  it('should yield lines from stdout', async () => {
    // Use node to echo for cross-platform support
    const generator = execStreaming(process.execPath, [
      '-e',
      'console.log("line 1\\nline 2")',
    ]);
    const lines = [];
    for await (const line of generator) {
      lines.push(line);
    }
    expect(lines).toEqual(['line 1', 'line 2']);
  });

  it('should throw error on non-zero exit code', async () => {
    // exit 2 via node
    const generator = execStreaming(process.execPath, [
      '-e',
      'process.exit(2)',
    ]);

    await expect(async () => {
      for await (const _ of generator) {
        // consume
      }
    }).rejects.toThrow();
  });

  it('should abort cleanly when signal is aborted', async () => {
    const controller = new AbortController();
    // sleep for 2s via node
    const generator = execStreaming(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 2000)'],
      { signal: controller.signal },
    );

    // Start reading
    const readPromise = (async () => {
      const lines = [];
      try {
        for await (const line of generator) {
          lines.push(line);
        }
      } catch (_e) {
        // ignore
      }
      return lines;
    })();

    setTimeout(() => {
      controller.abort();
    }, 100);

    const lines = await readPromise;
    expect(lines).toEqual([]);
  });
});
