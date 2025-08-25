/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Content } from '@google/genai';
import { Storage } from '../config/storage.js';

const LOG_FILE_NAME = 'logs.json';

export enum MessageSenderType {
  USER = 'user',
}

export interface LogEntry {
  sessionId: string;
  messageId: number;
  timestamp: string;
  type: MessageSenderType;
  message: string;
}

// This regex matches any character that is NOT a letter (a-z, A-Z),
// a number (0-9), a hyphen (-), an underscore (_), or a dot (.).

/**
 * Encodes a string to be safe for use as a filename.
 *
 * It replaces any characters that are not alphanumeric or one of `_`, `-`, `.`
 * with a URL-like percent-encoding (`%` followed by the 2-digit hex code).
 *
 * @param str The input string to encode.
 * @returns The encoded, filename-safe string.
 */
export function encodeTagName(str: string): string {
  return encodeURIComponent(str);
}

/**
 * Decodes a string that was encoded with the `encode` function.
 *
 * It finds any percent-encoded characters and converts them back to their
 * original representation.
 *
 * @param str The encoded string to decode.
 * @returns The decoded, original string.
 */
export function decodeTagName(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch (_e) {
    // Fallback for old, potentially malformed encoding
    return str.replace(/%([0-9A-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  }
}

export class Logger {
  private geminiDir: string | undefined;
  private logFilePath: string | undefined;
  private sessionId: string | undefined;
  private messageId = 0; // Instance-specific counter for the next messageId
  private initialized = false;
  private logs: LogEntry[] = []; // In-memory cache, ideally reflects the last known state of the file

  constructor(
    sessionId: string,
    private readonly storage: Storage,
  ) {
    this.sessionId = sessionId;
  }

  private async _readLogFile(): Promise<LogEntry[]> {
    if (!this.logFilePath) {
      throw new Error('Log file path not set during read attempt.');
    }
    try {
      const fileContent = await fs.readFile(this.logFilePath, 'utf-8');
      const parsedLogs = JSON.parse(fileContent);
      if (!Array.isArray(parsedLogs)) {
        console.debug(
          `Log file at ${this.logFilePath} is not a valid JSON array. Starting with empty logs.`,
        );
        await this._backupCorruptedLogFile('malformed_array');
        return [];
      }
      return parsedLogs.filter(
        (entry) =>
          typeof entry.sessionId === 'string' &&
          typeof entry.messageId === 'number' &&
          typeof entry.timestamp === 'string' &&
          typeof entry.type === 'string' &&
          typeof entry.message === 'string',
      ) as LogEntry[];
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return [];
      }
      if (error instanceof SyntaxError) {
        console.debug(
          `Invalid JSON in log file ${this.logFilePath}. Backing up and starting fresh.`,
          error,
        );
        await this._backupCorruptedLogFile('invalid_json');
        return [];
      }
      console.debug(
        `Failed to read or parse log file ${this.logFilePath}:`,
        error,
      );
      throw error;
    }
  }

  private async _backupCorruptedLogFile(reason: string): Promise<void> {
    if (!this.logFilePath) return;
    const backupPath = `${this.logFilePath}.${reason}.${Date.now()}.bak`;
    try {
      await fs.rename(this.logFilePath, backupPath);
      console.debug(`Backed up corrupted log file to ${backupPath}`);
    } catch (_backupError) {
      // If rename fails (e.g. file doesn't exist), no need to log an error here as the primary error (e.g. invalid JSON) is already handled.
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.geminiDir = this.storage.getProjectTempDir();
    this.logFilePath = path.join(this.geminiDir, LOG_FILE_NAME);

    try {
      await fs.mkdir(this.geminiDir, { recursive: true });
      let fileExisted = true;
      try {
        await fs.access(this.logFilePath);
      } catch (_e) {
        fileExisted = false;
      }
      this.logs = await this._readLogFile();
      if (!fileExisted && this.logs.length === 0) {
        await fs.writeFile(this.logFilePath, '[]', 'utf-8');
      }
      const sessionLogs = this.logs.filter(
        (entry) => entry.sessionId === this.sessionId,
      );
      this.messageId =
        sessionLogs.length > 0
          ? Math.max(...sessionLogs.map((entry) => entry.messageId)) + 1
          : 0;
      this.initialized = true;
    } catch (err) {
      console.error('Failed to initialize logger:', err);
      this.initialized = false;
    }
  }

  private async _updateLogFile(
    entryToAppend: LogEntry,
  ): Promise<LogEntry | null> {
    if (!this.logFilePath) {
      console.debug('Log file path not set. Cannot persist log entry.');
      throw new Error('Log file path not set during update attempt.');
    }

    let currentLogsOnDisk: LogEntry[];
    try {
      currentLogsOnDisk = await this._readLogFile();
    } catch (readError) {
      console.debug(
        'Critical error reading log file before append:',
        readError,
      );
      throw readError;
    }

    // Determine the correct messageId for the new entry based on current disk state for its session
    const sessionLogsOnDisk = currentLogsOnDisk.filter(
      (e) => e.sessionId === entryToAppend.sessionId,
    );
    const nextMessageIdForSession =
      sessionLogsOnDisk.length > 0
        ? Math.max(...sessionLogsOnDisk.map((e) => e.messageId)) + 1
        : 0;

    // Update the messageId of the entry we are about to append
    entryToAppend.messageId = nextMessageIdForSession;

    // Check if this entry (same session, same *recalculated* messageId, same content) might already exist
    // This is a stricter check for true duplicates if multiple instances try to log the exact same thing
    // at the exact same calculated messageId slot.
    const entryExists = currentLogsOnDisk.some(
      (e) =>
        e.sessionId === entryToAppend.sessionId &&
        e.messageId === entryToAppend.messageId &&
        e.timestamp === entryToAppend.timestamp && // Timestamps are good for distinguishing
        e.message === entryToAppend.message,
    );

    if (entryExists) {
      console.debug(
        `Duplicate log entry detected and skipped: session ${entryToAppend.sessionId}, messageId ${entryToAppend.messageId}`,
      );
      this.logs = currentLogsOnDisk; // Ensure in-memory is synced with disk
      return null; // Indicate that no new entry was actually added
    }

    currentLogsOnDisk.push(entryToAppend);

    try {
      await fs.writeFile(
        this.logFilePath,
        JSON.stringify(currentLogsOnDisk, null, 2),
        'utf-8',
      );
      this.logs = currentLogsOnDisk;
      return entryToAppend; // Return the successfully appended entry
    } catch (error) {
      console.debug('Error writing to log file:', error);
      throw error;
    }
  }

  async getPreviousUserMessages(): Promise<string[]> {
    if (!this.initialized) return [];
    return this.logs
      .filter((entry) => entry.type === MessageSenderType.USER)
      .sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateB - dateA;
      })
      .map((entry) => entry.message);
  }

  async logMessage(type: MessageSenderType, message: string): Promise<void> {
    if (!this.initialized || this.sessionId === undefined) {
      console.debug(
        'Logger not initialized or session ID missing. Cannot log message.',
      );
      return;
    }

    // The messageId used here is the instance's idea of the next ID.
    // _updateLogFile will verify and potentially recalculate based on the file's actual state.
    const newEntryObject: LogEntry = {
      sessionId: this.sessionId,
      messageId: this.messageId, // This will be recalculated in _updateLogFile
      type,
      message,
      timestamp: new Date().toISOString(),
    };

    try {
      const writtenEntry = await this._updateLogFile(newEntryObject);
      if (writtenEntry) {
        // If an entry was actually written (not a duplicate skip),
        // then this instance can increment its idea of the next messageId for this session.
        this.messageId = writtenEntry.messageId + 1;
      }
    } catch (_error) {
      // Error already logged by _updateLogFile or _readLogFile
    }
  }

  private _checkpointPath(tag: string): string {
    if (!tag.length) {
      throw new Error('No checkpoint tag specified.');
    }
    if (!this.geminiDir) {
      throw new Error('Checkpoint file path not set.');
    }
    // Encode the tag to handle all special characters safely.
    const encodedTag = encodeTagName(tag);
    return path.join(this.geminiDir, `checkpoint-${encodedTag}.json`);
  }

  private async _getCheckpointPath(tag: string): Promise<string> {
    // 1. Check for the new encoded path first.
    const newPath = this._checkpointPath(tag);
    try {
      await fs.access(newPath);
      return newPath; // Found it, use the new path.
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        throw error; // A real error occurred, rethrow it.
      }
      // It was not found, so we'll check the old path next.
    }

    // 2. Fallback for backward compatibility: check for the old raw path.
    const oldPath = path.join(this.geminiDir!, `checkpoint-${tag}.json`);
    try {
      await fs.access(oldPath);
      return oldPath; // Found it, use the old path.
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        throw error; // A real error occurred, rethrow it.
      }
    }

    // 3. If neither path exists, return the new encoded path as the canonical one.
    return newPath;
  }

  async saveCheckpoint(conversation: Content[], tag: string): Promise<void> {
    if (!this.initialized) {
      console.error(
        'Logger not initialized or checkpoint file path not set. Cannot save a checkpoint.',
      );
      return;
    }
    // Always save with the new encoded path.
    const path = this._checkpointPath(tag);
    try {
      await fs.writeFile(path, JSON.stringify(conversation, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error writing to checkpoint file:', error);
    }
  }

  async loadCheckpoint(tag: string): Promise<Content[]> {
    if (!this.initialized) {
      console.error(
        'Logger not initialized or checkpoint file path not set. Cannot load checkpoint.',
      );
      return [];
    }

    const path = await this._getCheckpointPath(tag);
    try {
      const fileContent = await fs.readFile(path, 'utf-8');
      const parsedContent = JSON.parse(fileContent);
      if (!Array.isArray(parsedContent)) {
        console.warn(
          `Checkpoint file at ${path} is not a valid JSON array. Returning empty checkpoint.`,
        );
        return [];
      }
      return parsedContent as Content[];
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        // This is okay, it just means the checkpoint doesn't exist in either format.
        return [];
      }
      console.error(`Failed to read or parse checkpoint file ${path}:`, error);
      return [];
    }
  }

  async deleteCheckpoint(tag: string): Promise<boolean> {
    if (!this.initialized || !this.geminiDir) {
      console.error(
        'Logger not initialized or checkpoint file path not set. Cannot delete checkpoint.',
      );
      return false;
    }

    let deletedSomething = false;

    // 1. Attempt to delete the new encoded path.
    const newPath = this._checkpointPath(tag);
    try {
      await fs.unlink(newPath);
      deletedSomething = true;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        console.error(`Failed to delete checkpoint file ${newPath}:`, error);
        throw error; // Rethrow unexpected errors
      }
      // It's okay if it doesn't exist.
    }

    // 2. Attempt to delete the old raw path for backward compatibility.
    const oldPath = path.join(this.geminiDir!, `checkpoint-${tag}.json`);
    if (newPath !== oldPath) {
      try {
        await fs.unlink(oldPath);
        deletedSomething = true;
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== 'ENOENT') {
          console.error(`Failed to delete checkpoint file ${oldPath}:`, error);
          throw error; // Rethrow unexpected errors
        }
        // It's okay if it doesn't exist.
      }
    }

    return deletedSomething;
  }

  async checkpointExists(tag: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error(
        'Logger not initialized. Cannot check for checkpoint existence.',
      );
    }
    let filePath: string | undefined;
    try {
      filePath = await this._getCheckpointPath(tag);
      // We need to check for existence again, because _getCheckpointPath
      // returns a canonical path even if it doesn't exist yet.
      await fs.access(filePath);
      return true;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return false; // It truly doesn't exist in either format.
      }
      // A different error occurred.
      console.error(
        `Failed to check checkpoint existence for ${
          filePath ?? `path for tag "${tag}"`
        }:`,
        error,
      );
      throw error;
    }
  }

  close(): void {
    this.initialized = false;
    this.logFilePath = undefined;
    this.logs = [];
    this.sessionId = undefined;
    this.messageId = 0;
  }
}
