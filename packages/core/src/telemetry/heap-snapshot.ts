/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import v8 from 'node:v8';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Utility to capture a V8 heap snapshot.
 * Snapshots are saved to a secure, uniquely named temporary directory.
 *
 * @returns The absolute path to the generated .heapsnapshot file, or null if it failed.
 */
export function captureHeapSnapshot(): string | null {
  try {
    const timestamp = Date.now();
    const filename = `gemini-heap-${timestamp}.heapsnapshot`;

    // Use mkdtempSync for a secure, uniquely named directory (mitigates symlink attacks)
    const snapshotsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-heap-'));
    const filePath = path.join(snapshotsDir, filename);

    // Note: v8.writeHeapSnapshot is a synchronous, blocking operation.
    // This is intentional during diagnostics to capture a consistent heap state.
    v8.writeHeapSnapshot(filePath);

    return filePath;
  } catch (error) {
    // Telemetry/diagnostic failures should not crash the application
    debugLogger.error('Failed to capture heap snapshot:', error);
    return null;
  }
}
