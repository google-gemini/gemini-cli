/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { HeapProfiler, InspectorNotification } from 'node:inspector';

/**
 * RSS threshold at which `/bug` auto-captures a heap snapshot.
 */
export const MEMORY_SNAPSHOT_AUTO_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Capture a V8 heap snapshot from the current process and stream it to disk.
 *
 * Uses the in-process `node:inspector/promises` Session, so no debugger port
 * is opened and the existing `inspector.open()` trigger in activityLogger is
 * unaffected. Chunks are written straight to the output file to keep peak
 * memory overhead constant — important because this code path is typically
 * invoked when the process is already under memory pressure.
 */
export async function captureHeapSnapshot(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });

  const { Session } = await import('node:inspector/promises');
  const session = new Session();
  session.connect();

  try {
    const stream = createWriteStream(filePath, { encoding: 'utf-8' });
    const streamClosed = new Promise<void>((resolve, reject) => {
      stream.once('finish', resolve);
      stream.once('error', reject);
    });

    const onChunk = (
      message: InspectorNotification<HeapProfiler.AddHeapSnapshotChunkEventDataType>,
    ) => {
      stream.write(message.params.chunk);
    };
    session.on('HeapProfiler.addHeapSnapshotChunk', onChunk);

    try {
      await session.post('HeapProfiler.takeHeapSnapshot', {
        reportProgress: false,
      });
    } finally {
      session.removeListener('HeapProfiler.addHeapSnapshotChunk', onChunk);
      stream.end();
    }

    await streamClosed;
  } finally {
    session.disconnect();
  }
}
