/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { constants } from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { isNodeError } from '../utils/errors.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Config } from '../config/config.js';
import type { ToolResult } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { makeRelative, shortenPath } from '../utils/paths.js';

const MAX_BACKUP_VERSIONS = 20;

function contentsEqualNormalized(a: string, b: string): boolean {
  let ai = 0;
  let bi = 0;
  while (ai < a.length && bi < b.length) {
    let ac = a[ai];
    let bc = b[bi];
    if (ac === '\r' && a[ai + 1] === '\n') {
      ac = '\n';
      ai++;
    }
    if (bc === '\r' && b[bi + 1] === '\n') {
      bc = '\n';
      bi++;
    }
    if (ac !== bc) return false;
    ai++;
    bi++;
  }
  return ai === a.length && bi === b.length;
}

export function fnv1a64hex(str: string): string {
  const FNV_PRIME = 1099511628211n;
  const OFFSET_BASIS = 14695981039346656037n;
  const MASK64 = 0xffffffffffffffffn;
  let hash = OFFSET_BASIS;
  const bytes = new TextEncoder().encode(str);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, '0');
}

export function getBackupPath(
  filePath: string,
  version: number,
  backupDir: string,
): string {
  return path.join(backupDir, `${fnv1a64hex(filePath)}_${version}`);
}

/**
 * Returns the sorted list of backup version numbers for a file by scanning the
 * backup directory. Stateless — no ledger required.
 */
export async function listBackupVersions(
  filePath: string,
  backupDir: string,
): Promise<number[]> {
  const prefix = `${fnv1a64hex(filePath)}_`;
  try {
    const entries = await fsPromises.readdir(backupDir, {
      withFileTypes: true,
    });
    return entries
      .filter((e) => e.isFile() && e.name.startsWith(prefix))
      .map((e) => parseInt(e.name.slice(prefix.length), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
  } catch (e) {
    if (isNodeError(e) && e.code === 'ENOENT') return [];
    debugLogger.warn('Failed to read backup directory:', e);
    return [];
  }
}

export type BackupResult =
  | { ok: true; version: number; backupPath: string }
  | { ok: false; newFile: true }
  | { ok: false; newFile: false };

/**
 * Backs up filePath before a destructive write. Returns `{ ok: false, newFile:
 * true }` when the source does not exist (no backup needed for new files).
 * Returns `{ ok: false, newFile: false }` when the file exists but the backup
 * failed — callers must treat this as a hard error and abort the write.
 *
 * Version slots are claimed atomically with COPYFILE_EXCL so concurrent writes
 * never collide. After each successful backup, versions exceeding
 * MAX_BACKUP_VERSIONS are rotated out; ENOENT during deletion is silently
 * ignored (another concurrent process already cleaned up that slot).
 */
export async function createPreWriteBackup(
  filePath: string,
  backupDir: string,
  diskContent?: string,
): Promise<BackupResult> {
  const existingVersions = await listBackupVersions(filePath, backupDir);

  let content = diskContent;

  if (existingVersions.length > 0) {
    if (content === undefined) {
      try {
        content = await fsPromises.readFile(filePath, 'utf8');
      } catch (e) {
        if (isNodeError(e) && e.code === 'ENOENT') {
          return { ok: false, newFile: true };
        }
        debugLogger.warn('Failed to read file for backup:', e);
        return { ok: false, newFile: false };
      }
    }

    const latestVersion = existingVersions[existingVersions.length - 1];
    const latestPath = getBackupPath(filePath, latestVersion, backupDir);
    try {
      const latestContent = await fsPromises.readFile(latestPath, 'utf8');
      if (contentsEqualNormalized(latestContent, content)) {
        return { ok: true, version: latestVersion, backupPath: latestPath };
      }
    } catch (e) {
      if (!isNodeError(e) || e.code !== 'ENOENT') {
        debugLogger.warn('Failed to read last backup for dedup check:', e);
      }
    }
  }

  // The backup directory is expected to be created securely by the caller
  // (e.g. via Storage.getProjectBackupDir using mkdtempSync).
  // We call mkdir here as a safety measure for other callers, but it will
  // likely be a no-op for most.
  try {
    await fsPromises.mkdir(backupDir, { recursive: true, mode: 0o700 });
  } catch (e) {
    debugLogger.warn('Failed to ensure backup directory exists:', e);
    return { ok: false, newFile: false };
  }

  const startVersion =
    existingVersions.length > 0
      ? existingVersions[existingVersions.length - 1] + 1
      : 1;

  let claimedVersion: number | null = null;
  let backupPath: string | null = null;
  for (let v = startVersion; v < startVersion + 100; v++) {
    const candidatePath = getBackupPath(filePath, v, backupDir);
    try {
      await fsPromises.copyFile(
        filePath,
        candidatePath,
        constants.COPYFILE_EXCL,
      );
      claimedVersion = v;
      backupPath = candidatePath;
      break;
    } catch (e) {
      if (isNodeError(e) && e.code === 'EEXIST') continue;
      if (isNodeError(e) && e.code === 'ENOENT') {
        return { ok: false, newFile: true };
      }
      debugLogger.warn('Failed to create backup:', e);
      return { ok: false, newFile: false };
    }
  }

  if (claimedVersion === null || backupPath === null) {
    debugLogger.warn(
      'Failed to claim a backup version slot after 100 attempts.',
    );
    return { ok: false, newFile: false };
  }

  const allVersions = await listBackupVersions(filePath, backupDir);
  if (allVersions.length > MAX_BACKUP_VERSIONS) {
    const toDelete = allVersions.slice(
      0,
      allVersions.length - MAX_BACKUP_VERSIONS,
    );
    await Promise.all(
      toDelete.map(async (v) => {
        const oldPath = getBackupPath(filePath, v, backupDir);
        try {
          await fsPromises.unlink(oldPath);
        } catch (e) {
          if (!isNodeError(e) || e.code !== 'ENOENT') {
            debugLogger.warn(`Failed to delete old backup version ${v}:`, e);
          }
        }
      }),
    );
  }

  return { ok: true, version: claimedVersion, backupPath };
}

export type PreWriteBackupOutcome =
  | { backupVersion: number | null }
  | { errorResult: ToolResult };

/**
 * Shared pre-write backup handler used by edit and write-file tools.
 * Returns `{ backupVersion }` on success (null when the file is new), or
 * `{ errorResult }` when the backup failed and the write must be aborted.
 */
export async function handlePreWriteBackup(
  config: Config,
  resolvedPath: string,
  isNewFile: boolean,
  diskContent?: string,
): Promise<PreWriteBackupOutcome> {
  if (isNewFile) {
    return { backupVersion: null };
  }

  const backupDir = config.storage.getProjectBackupDir();

  const backupResult = await createPreWriteBackup(
    resolvedPath,
    backupDir,
    diskContent,
  );

  if (backupResult.ok) {
    return { backupVersion: backupResult.version };
  }

  if (!backupResult.newFile) {
    const rel = makeRelative(resolvedPath, config.getTargetDir());
    const msg = `Cannot back up ${shortenPath(rel)} before writing. Write aborted to prevent data loss.`;
    return {
      errorResult: {
        llmContent: msg,
        returnDisplay: msg,
        error: { message: msg, type: ToolErrorType.FILE_WRITE_FAILURE },
      },
    };
  }

  return { backupVersion: null };
}

export function makeBackupVersionMessage(
  backupVersion: number,
  resolvedPath: string,
  config: Config,
): string {
  const relativePath = makeRelative(resolvedPath, config.getTargetDir());
  return `Backed up as version ${backupVersion} — restore_file("${relativePath}", ${backupVersion}) to revert.`;
}
