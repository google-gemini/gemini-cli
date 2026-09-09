/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { getHeapSnapshot } from 'node:v8';

/**
 * RSS threshold at which `/bug` auto-captures a heap snapshot.
 */
export const MEMORY_SNAPSHOT_AUTO_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Capture a V8 heap snapshot from the current process and write it to disk.
 *
 * `v8.getHeapSnapshot()` returns a Readable stream whose producer is V8's
 * internal snapshot generator. Piping it through `node:stream/promises`'
 * `pipeline` propagates backpressure end-to-end, so even a multi-gigabyte
 * heap is written without buffering the serialized snapshot in memory.
 * Nothing is exposed over a debugger port.
 */
export async function captureHeapSnapshot(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await pipeline(getHeapSnapshot(), createWriteStream(filePath));
}
