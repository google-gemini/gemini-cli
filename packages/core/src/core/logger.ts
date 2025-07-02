/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Content } from '@google/genai';
import { getProjectTempDir } from '../utils/paths.js';

const LOG_FILE_NAME = 'logs.json';
const CHECKPOINT_FILE_NAME = 'checkpoint.json';

export enum MessageSenderType {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system',
}

enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR,
}


export interface LogEntry {
  sessionId: string;
  messageId: number;
  timestamp: string;
  type: MessageSenderType;
  message: string;
}

export class Logger {
  private logLevel: LogLevel = LogLevel.INFO;
  private logFilePath: string | undefined;
  private checkpointFilePath: string | undefined;
  private sessionId: string | undefined;
  private messageId = 0; // Instance-specific counter for the next messageId
  private initialized = false;
  private logs: LogEntry[] = []; // In-memory cache, ideally reflects the last known state of the file

  constructor(sessionId?: string) {
    this.sessionId = sessionId;
  }

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
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

    this.geminiDir = getProjectTempDir(process.cwd());
    this.logFilePath = path.join(this.geminiDir, LOG_FILE_NAME);
    this.checkpointFilePath = path.join(this.geminiDir, CHECKPOINT_FILE_NAME);

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

  private log(level: LogLevel, message: string, ...args: unknown[]) {
    if (level < this.logLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level];
    const formattedMessage = `${timestamp} [${levelStr}] ${message}`;
    console.log(formattedMessage, ...args);

    // Also log to file if initialized and session ID is available
    if (this.initialized && this.sessionId !== undefined) {
      const newEntryObject: LogEntry = {
        sessionId: this.sessionId,
        messageId: this.messageId, // This will be recalculated in _updateLogFile
        type: this.mapLogLevelToMessageSenderType(level),
        message: formattedMessage + ' ' + args.map(String).join(' '),
        timestamp: new Date().toISOString(),
      };
      this._updateLogFile(newEntryObject).catch((err) => {
        console.error('Failed to write log entry to file:', err);
      });
    }
  }

  private mapLogLevelToMessageSenderType(level: LogLevel): MessageSenderType {
    switch (level) {
      case LogLevel.DEBUG:
        return MessageSenderType.SYSTEM; // Or a new DEBUG type if needed
      case LogLevel.INFO:
        return MessageSenderType.SYSTEM;
      case LogLevel.WARN:
        return MessageSenderType.SYSTEM;
      case LogLevel.ERROR:
        return MessageSenderType.SYSTEM;
      default:
        return MessageSenderType.SYSTEM;
    }
  }

  debug(message: string, ...args: unknown[]) {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: unknown[]) {
    this.log(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    this.log(LogLevel.WARN, message, ...args);
  }

  error(message: string, ...args: unknown[]) {
    this.log(LogLevel.ERROR, message, ...args);
  }

  _checkpointPath(tag: string | undefined): string {
    if (!this.checkpointFilePath || !this.geminiDir) {
      throw new Error('Checkpoint file path not set.');
    }
    if (!tag) {
      return this.checkpointFilePath;
    }
    return path.join(this.geminiDir, `checkpoint-${tag}.json`);
  }

  async saveCheckpoint(conversation: Content[], tag?: string): Promise<void> {
    if (!this.initialized || !this.checkpointFilePath) {
      console.error(
        'Logger not initialized or checkpoint file path not set. Cannot save a checkpoint.',
      );
      return;
    }
    const path = this._checkpointPath(tag);
    try {
      await fs.writeFile(path, JSON.stringify(conversation, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error writing to checkpoint file:', error);
    }
  }

  async loadCheckpoint(tag?: string): Promise<Content[]> {
    if (!this.initialized || !this.checkpointFilePath) {
      console.error(
        'Logger not initialized or checkpoint file path not set. Cannot load checkpoint.',
      );
      return [];
    }

    const path = this._checkpointPath(tag);

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
        // File doesn't exist, which is fine. Return empty array.
        return [];
      }
      console.error(`Failed to read or parse checkpoint file ${path}:`, error);
      return [];
    }
  }

  close(): void {
    this.initialized = false;
    this.logFilePath = undefined;
    this.checkpointFilePath = undefined;
    this.logs = [];
    this.sessionId = undefined;
    this.messageId = 0;
  }
}

export const logger = new Logger();
