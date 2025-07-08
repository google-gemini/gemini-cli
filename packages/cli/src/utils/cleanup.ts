/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getProjectTempDir } from '@icarus603/gemini-code-core';
import { promises as fs } from 'fs';
import { join } from 'path';

export async function cleanupCheckpoints() {
  const tempDir = getProjectTempDir(process.cwd());
  const checkpointsDir = join(tempDir, 'checkpoints');
  try {
    await fs.rm(checkpointsDir, { recursive: true, force: true });
  } catch {
    // Ignore errors if the directory doesn't exist or fails to delete.
  }
}
