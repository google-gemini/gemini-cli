/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { getProjectTempDir } from '@google/gemini-cli-core';

const MAX_CHECKPOINTS = 5; // Keep the 5 most recent checkpoints
const MAX_SESSIONS = 5; // Keep the 5 most recent sessions

async function cleanupDirectory(dirName: string, maxFiles: number) {
  const tempDir = getProjectTempDir(process.cwd());
  const targetDir = join(tempDir, dirName);

  try {
    await fs.mkdir(targetDir, { recursive: true });
    const files = await fs.readdir(targetDir);
    const sessionFiles = files
      .map((file) => ({
        name: file,
        path: join(targetDir, file),
      }))
      .filter((file) => file.name.startsWith('session-')); // Filter for session files

    const sortedFiles = await Promise.all(
      sessionFiles.map(async (file) => {
        const stats = await fs.stat(file.path);
        return { ...file, mtimeMs: stats.mtimeMs };
      }),
    );

    sortedFiles.sort((a, b) => b.mtimeMs - a.mtimeMs); // Sort by modification time, newest first

    for (let i = maxFiles; i < sortedFiles.length; i++) {
      await fs.unlink(sortedFiles[i].path); // Delete older files
    }
  } catch (error) {
    // Ignore errors if the directory doesn't exist or fails to delete/read files.
    console.warn(`Error during ${dirName} cleanup: ${error}`);
  }
}

export async function cleanupOldCheckpoints() {
  // Clean up both checkpoints and sessions directories
  await Promise.all([
    cleanupDirectory('checkpoints', MAX_CHECKPOINTS),
    cleanupDirectory('sessions', MAX_SESSIONS),
  ]);
}
