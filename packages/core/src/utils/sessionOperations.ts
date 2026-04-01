/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { sanitizeFilenamePart } from './fileUtils.js';
import { debugLogger } from './debugLogger.js';

const LOGS_DIR = 'logs';
const TOOL_OUTPUTS_DIR = 'tool-outputs';

/**
 * Validates a sessionId and returns a sanitized version.
 * Throws an error if the ID is dangerous (e.g., ".", "..", or empty).
 */
export function validateAndSanitizeSessionId(sessionId: string): string {
  if (!sessionId || sessionId === '.' || sessionId === '..') {
    throw new Error(`Invalid sessionId: ${sessionId}`);
  }
  const sanitized = sanitizeFilenamePart(sessionId);
  if (!sanitized) {
    throw new Error(`Invalid sessionId after sanitization: ${sessionId}`);
  }
  return sanitized;
}

/**
 * Asynchronously deletes activity logs and tool outputs for a specific session ID.
 */
export async function deleteSessionArtifactsAsync(
  sessionId: string,
  tempDir: string,
): Promise<void> {
  try {
    const safeSessionId = validateAndSanitizeSessionId(sessionId);
    const logsDir = path.join(tempDir, LOGS_DIR);
    const logPath = path.join(logsDir, `session-${safeSessionId}.jsonl`);

    // Use fs.promises.unlink directly since we don't need to check exists first
    // (catching ENOENT is idiomatic for async file system ops)
    await fs.unlink(logPath).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });

    const toolOutputsBase = path.join(tempDir, TOOL_OUTPUTS_DIR);
    const toolOutputDir = path.join(
      toolOutputsBase,
      `session-${safeSessionId}`,
    );

    await fs
      .rm(toolOutputDir, { recursive: true, force: true })
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      });

    // Top-level session directory (e.g., tempDir/safeSessionId)
    const sessionDir = path.join(tempDir, safeSessionId);
    await fs
      .rm(sessionDir, { recursive: true, force: true })
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      });
  } catch (error) {
    debugLogger.error(
      `Error deleting session artifacts for ${sessionId}:`,
      error,
    );
  }
}

/**
 * Iterates through subagent files in a parent's directory and deletes their artifacts
 * before deleting the directory itself.
 */
export async function deleteSubagentSessionDirAndArtifactsAsync(
  parentSessionId: string,
  chatsDir: string,
  tempDir: string,
): Promise<void> {
  const safeParentSessionId = validateAndSanitizeSessionId(parentSessionId);
  const subagentDir = path.join(chatsDir, safeParentSessionId);

  // Safety check to ensure we don't escape chatsDir
  if (!subagentDir.startsWith(chatsDir + path.sep)) {
    throw new Error(`Dangerous subagent directory path: ${subagentDir}`);
  }

  try {
    const files = await fs
      .readdir(subagentDir, { withFileTypes: true })
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') return [];
        throw err;
      });

    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.json')) {
        const agentId = path.basename(file.name, '.json');
        await deleteSessionArtifactsAsync(agentId, tempDir);
      }
    }

    // Finally, remove the directory itself
    await fs
      .rm(subagentDir, { recursive: true, force: true })
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      });
  } catch (error) {
    debugLogger.error(
      `Error cleaning up subagents for parent ${parentSessionId}:`,
      error,
    );
    // If directory listing fails, we still try to remove the directory if it exists,
    // or let the error propagate if it's a critical failure.
    await fs.rm(subagentDir, { recursive: true, force: true }).catch(() => {});
  }
}
