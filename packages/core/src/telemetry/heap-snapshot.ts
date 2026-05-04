/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import v8 from 'node:v8';
import path from 'node:path';
import fs from 'node:fs';
import { tmpdir } from '../utils/paths.js';

/**
 * Minimal utility to capture a V8 heap snapshot.
 * Snapshots are saved to the system temporary directory.
 *
 * @returns The absolute path to the generated .heapsnapshot file.
 */
export function captureHeapSnapshot(): string {
  const timestamp = Date.now();
  const filename = `gemini-heap-${timestamp}.heapsnapshot`;
  const snapshotsDir = path.join(tmpdir(), 'gemini-snapshots');

  // Ensure directory exists
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }

  const filePath = path.join(snapshotsDir, filename);

  // v8.writeHeapSnapshot returns the filename it wrote to
  v8.writeHeapSnapshot(filePath);

  return filePath;
}
