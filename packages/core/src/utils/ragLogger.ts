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
      // Create with strict permissions (0o600) to protect proprietary code snippets
      fs.appendFileSync(this.logPath, JSON.stringify(fullEntry) + '\n', {
        encoding: 'utf8',
      });
      fs.chmodSync(this.logPath, 0o600);
    } catch (e) {
      debugLogger.error(`Failed to write to ${this.logPath}`, e);
    }
  }
}

export const ragLogger = new RagLogger();
