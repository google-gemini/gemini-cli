/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import sqlite3 from 'sqlite3';
import { promises as fs } from 'node:fs';

const GEMINI_DIR = '.gemini';
const DB_NAME = 'logs.db';
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS messages (
    session_id INTEGER,
    message_id INTEGER,
    timestamp TEXT,
    type TEXT,
    message TEXT
);`;

export enum MessageSenderType {
  USER = 'user',
}

export class Logger {
  private db: sqlite3.Database | undefined;
  private sessionId: number | undefined;
  private messageId: number | undefined;

  constructor() {}

  async initialize(): Promise<void> {
    if (this.db) {
      return;
    }

    this.sessionId = Math.floor(Date.now() / 1000);
    this.messageId = 0;

    // Could be cleaner if our sqlite package supported promises.
    return new Promise((resolve, reject) => {
      const DB_DIR = path.resolve(process.cwd(), GEMINI_DIR);
      const DB_PATH = path.join(DB_DIR, DB_NAME);
      fs.mkdir(DB_DIR, { recursive: true })
        .then(() => {
          this.db = new sqlite3.Database(
            DB_PATH,
            sqlite3.OPEN_READWRITE |
              sqlite3.OPEN_CREATE |
              sqlite3.OPEN_FULLMUTEX,
            (err: Error | null) => {
              if (err) {
                reject(err);
              }

              // Read and execute the SQL script in create_tables.sql
              this.db?.exec(CREATE_TABLE_SQL, (err: Error | null) => {
                if (err) {
                  this.db?.close();
                  reject(err);
                }
                resolve();
              });
            },
          );
        })
        .catch(reject);
    });
  }

  /**
   * Get list of previous user inputs sorted most recent first.
   * @returns list of messages.
   */
  async getPreviousUserMessages(): Promise<string[]> {
    if (!this.db) {
      console.error('Database not initialized.');
      return [];
    }

    return new Promise((resolve, reject) => {
      // Most recent messages first
      const query = `SELECT message FROM messages 
      WHERE type = '${MessageSenderType.USER}'
      ORDER BY session_id DESC, message_id DESC`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.db!.all(query, [], (err: Error | null, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map((row) => row.message));
        }
      });
    });
  }

  async logMessage(type: MessageSenderType, message: string): Promise<void> {
    if (!this.db) {
      console.error('Database not initialized.');
      return;
    }

    return new Promise((resolve, reject) => {
      const query = `INSERT INTO messages (session_id, message_id, type, message, timestamp) VALUES (?, ?, ?, ?, datetime('now'))`;
      this.messageId = this.messageId! + 1;
      this.db!.run(
        query,
        [this.sessionId || 0, this.messageId - 1, type, message],
        (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  close(): void {
    if (this.db) {
      this.db.close((err: Error | null) => {
        if (err) {
          console.error('Error closing database:', err.message);
        }
      });
      this.db = undefined;
    }
  }
}
