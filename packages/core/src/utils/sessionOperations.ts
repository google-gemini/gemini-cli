/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { sanitizeFilenamePart } from './fileUtils.js';
import { debugLogger } from './debugLogger.js';
import { isNodeError } from './errors.js';
import type { Config } from '../config/config.js';
import { SESSION_FILE_PREFIX } from '../services/chatRecordingTypes.js';

const LOGS_DIR = 'logs';
const TOOL_OUTPUTS_DIR = 'tool-outputs';
const CHATS_DIR = 'chats';

/**
 * Reserved directory names that must never be treated as a session id. A
 * crafted JSONL session file whose first record had `sessionId: "chats"`
 * (or any other reserved name) could otherwise resolve to the project's
 * top-level chats/logs/tool-outputs directory and have it deleted by
 * `deleteSessionArtifactsAsync`.
 */
const RESERVED_SESSION_DIR_NAMES: ReadonlySet<string> = new Set([
  CHATS_DIR,
  LOGS_DIR,
  TOOL_OUTPUTS_DIR,
]);

function isSessionIdRecord(record: unknown): record is { sessionId: string } {
  return (
    record !== null &&
    typeof record === 'object' &&
    'sessionId' in record &&
    typeof (record as { sessionId: unknown }).sessionId === 'string'
  );
}

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

    // Top-level session directory (e.g., tempDir/safeSessionId). Reserved
    // directory names (chats, logs, tool-outputs) are skipped here to prevent
    // a crafted session file from causing one of the project's top-level
    // temp directories to be deleted. Case-insensitive because macOS and
    // Windows resolve `Chats` and `chats` to the same path.
    //
    // `safeSessionId` should never contain path separators (sanitizeFilenamePart
    // replaces every non-`[a-zA-Z0-9_-]` character with `_`), but we re-assert
    // it here so this deletion path is internally defended against future
    // changes to the sanitizer.
    const hasSeparator =
      safeSessionId.includes(path.sep) ||
      safeSessionId.includes('/') ||
      safeSessionId.includes('\\');
    if (
      !hasSeparator &&
      !RESERVED_SESSION_DIR_NAMES.has(safeSessionId.toLowerCase())
    ) {
      const sessionDir = path.join(tempDir, safeSessionId);
      await fs
        .rm(sessionDir, { recursive: true, force: true })
        .catch((err: NodeJS.ErrnoException) => {
          if (err.code !== 'ENOENT') throw err;
        });
    }
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
      if (
        file.isFile() &&
        (file.name.endsWith('.json') || file.name.endsWith('.jsonl'))
      ) {
        const agentId = path.basename(file.name, path.extname(file.name));
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

/**
 * Derives an 8-character short id from either a raw session id or a stored
 * session file basename. Throws if the input cannot produce a valid short id.
 */
export function deriveSessionShortId(sessionIdOrBasename: string): string {
  let shortId = sessionIdOrBasename;
  if (sessionIdOrBasename.startsWith(SESSION_FILE_PREFIX)) {
    const withoutExt = sessionIdOrBasename.replace(/\.jsonl?$/, '');
    const parts = withoutExt.split('-');
    shortId = parts[parts.length - 1];
  } else if (sessionIdOrBasename.length >= 8) {
    shortId = sessionIdOrBasename.slice(0, 8);
  } else {
    throw new Error('Invalid sessionId or basename provided for deletion');
  }

  if (shortId.length !== 8) {
    throw new Error('Derived shortId must be exactly 8 characters');
  }

  return shortId;
}

/**
 * Returns the list of stored session file names in `chatsDir` whose suffix
 * matches the given 8-character short id.
 */
export async function getMatchingSessionFiles(
  chatsDir: string,
  shortId: string,
): Promise<string[]> {
  const files = await fs.readdir(chatsDir);
  return files.filter(
    (f) =>
      f.startsWith(SESSION_FILE_PREFIX) &&
      (f.endsWith(`-${shortId}.json`) || f.endsWith(`-${shortId}.jsonl`)),
  );
}

/**
 * Deletes a single session file and its associated logs, tool outputs, and
 * any subagent directory. Reads the file's first line (or full body as a
 * fallback) to recover the full session id required for artifact cleanup.
 */
export async function deleteSessionFileAndArtifacts(
  chatsDir: string,
  file: string,
  tempDir: string,
): Promise<void> {
  const filePath = path.join(chatsDir, file);
  let fullSessionId: string | undefined;

  try {
    const CHUNK_SIZE = 4096;
    const buffer = Buffer.alloc(CHUNK_SIZE);
    let firstLine: string;
    let fd: fs.FileHandle | undefined;
    try {
      fd = await fs.open(filePath, 'r');
      const { bytesRead } = await fd.read(buffer, 0, CHUNK_SIZE, 0);
      if (bytesRead > 0) {
        const contentChunk = buffer.toString('utf8', 0, bytesRead);
        const newlineIndex = contentChunk.indexOf('\n');
        firstLine =
          newlineIndex !== -1
            ? contentChunk.substring(0, newlineIndex)
            : contentChunk;

        try {
          const content = JSON.parse(firstLine) as unknown;
          if (isSessionIdRecord(content)) {
            fullSessionId = content.sessionId;
          }
        } catch {
          // First line wasn't a parseable JSON record; fall back to full read.
        }
      }
    } finally {
      if (fd !== undefined) {
        await fd.close();
      }
    }

    if (!fullSessionId) {
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(fileContent) as unknown;
        if (isSessionIdRecord(parsed)) {
          fullSessionId = parsed.sessionId;
        }
      } catch {
        // Ignore parse errors, we'll still try to unlink the file below.
      }
    }

    if (fullSessionId) {
      await deleteSessionArtifactsAsync(fullSessionId, tempDir);
      await deleteSubagentSessionDirAndArtifactsAsync(
        fullSessionId,
        chatsDir,
        tempDir,
      );
    }
  } catch (error) {
    // ENOENT here is most likely a concurrent deletion race (another caller
    // unlinked the file between `getMatchingSessionFiles` returning it and
    // our `fs.open`). Don't log that as an error to avoid noise.
    if (!isNodeError(error) || error.code !== 'ENOENT') {
      debugLogger.error(
        `Error deleting artifacts for session file ${file}:`,
        error,
      );
    }
  } finally {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (isNodeError(error) && error.code !== 'ENOENT') {
        debugLogger.error(`Error unlinking session file ${file}:`, error);
      }
    }
  }
}

/**
 * Deletes a stored chat session and all of its on-disk artifacts. Accepts
 * either a raw session id (UUID-style) or a stored session file basename.
 *
 * This is the storage-only counterpart to `ChatRecordingService.deleteSession`
 * and can be called from contexts that only have a `Config` (e.g. the CLI's
 * one-shot session-delete utility) without constructing an `AgentLoopContext`.
 */
export async function deleteStoredSession(
  config: Config,
  sessionIdOrBasename: string,
): Promise<void> {
  try {
    const tempDir = config.storage.getProjectTempDir();
    const chatsDir = path.join(tempDir, 'chats');
    const shortId = deriveSessionShortId(sessionIdOrBasename);

    const chatsDirStat = await fs.stat(chatsDir).catch(() => null);
    if (!chatsDirStat || !chatsDirStat.isDirectory()) {
      return;
    }

    const matchingFiles = await getMatchingSessionFiles(chatsDir, shortId);
    for (const file of matchingFiles) {
      await deleteSessionFileAndArtifacts(chatsDir, file, tempDir);
    }
  } catch (error) {
    debugLogger.error('Error deleting session file.', error);
    throw error;
  }
}
