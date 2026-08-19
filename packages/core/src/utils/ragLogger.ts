/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogger } from './debugLogger.js';

export interface RagSnippet {
  repository?: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  relevanceScore?: number;
  content: string;
}

export interface RagLogEntry {
  timestamp: string;
  sessionId: string;
  ragStatus: string;
  snippets: RagSnippet[];
}

export class RagLogger {
  private logPath: string | undefined;
  private hasInitializedFile = false;

  /**
   * Initializes the logger with the project's temporary logs directory.
   */
  initialize(logsDir: string) {
    this.logPath = path.join(logsDir, 'rag-trace.log');

    // Ensure the directory exists
    try {
      fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });
      const actualPath = fs.realpathSync(logsDir);
      fs.chmodSync(actualPath, 0o700);
    } catch (e) {
      debugLogger.error(
        'Failed to create or set permissions for rag-trace.log directory',
        e,
      );
    }
  }

  /**
   * Logs a RAG trace entry as JSONL.
   */
  log(entry: Omit<RagLogEntry, 'timestamp'>) {
    if (!this.logPath) {
      debugLogger.warn('RagLogger was called before being initialized.');
      return;
    }

    const fullEntry: RagLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    try {
      // Use openSync to atomically create the file with strict permissions
      const fd = fs.openSync(this.logPath, 'a', 0o600);

      if (!this.hasInitializedFile) {
        // Ensure permissions are strict even if the file was pre-created
        fs.fchmodSync(fd, 0o600);
        this.hasInitializedFile = true;
      }

      fs.writeSync(fd, JSON.stringify(fullEntry) + '\n', null, 'utf8');
      fs.closeSync(fd);
    } catch (e) {
      debugLogger.error(`Failed to write to ${this.logPath}`, e);
    }
  }
}

export const ragLogger = new RagLogger();
