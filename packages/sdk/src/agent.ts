/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Storage,
  createSessionId,
  type ResumedSessionData,
  type ConversationRecord,
} from '@google/gemini-cli-core';

import { GeminiCliSession } from './session.js';
import type { GeminiCliAgentOptions } from './types.js';

export class GeminiCliAgent {
  private options: GeminiCliAgentOptions;

  constructor(options: GeminiCliAgentOptions) {
    this.options = options;
  }

  session(options?: { sessionId?: string }): GeminiCliSession {
    const sessionId = options?.sessionId || createSessionId();
    return new GeminiCliSession(this.options, sessionId, this);
  }

  async resumeSession(sessionId?: string): Promise<GeminiCliSession> {
    const cwd = this.options.cwd || process.cwd();
    const storage = new Storage(cwd);
    await storage.initialize();

    const chatsDir = path.join(storage.getProjectTempDir(), 'chats');

    if (!fs.existsSync(chatsDir)) {
      throw new Error(`No sessions found in ${chatsDir}`);
    }

    const files = await fs.promises.readdir(chatsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      throw new Error(`No sessions found in ${chatsDir}`);
    }

    // Get stats for sorting
    const fileStats = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(chatsDir, file);
        const stats = await fs.promises.stat(filePath);
        return { file, filePath, mtime: stats.mtimeMs };
      }),
    );

    // Sort by mtime desc
    fileStats.sort((a, b) => b.mtime - a.mtime);

    let targetFile: { filePath: string } | undefined;

    if (sessionId) {
      // Find specific session
      // Optimization: filenames in ChatRecordingService include first 8 chars of sessionId.
      // We prioritize files that match this pattern.
      const truncatedId = sessionId.slice(0, 8);
      const sortedFiles = [
        ...fileStats.filter((f) => f.file.includes(truncatedId)),
        ...fileStats.filter((f) => !f.file.includes(truncatedId)),
      ];

      for (const f of sortedFiles) {
        try {
          const content = await fs.promises.readFile(f.filePath, 'utf8');
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const data = JSON.parse(content) as ConversationRecord;
          if (data.sessionId === sessionId) {
            targetFile = f;
            break;
          }
        } catch (_e) {
          // Ignore parse errors
        }
      }

      if (!targetFile) {
        throw new Error(`Session with ID ${sessionId} not found`);
      }
    } else {
      // Most recent
      targetFile = fileStats[0];
    }

    const content = await fs.promises.readFile(targetFile.filePath, 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const conversation = JSON.parse(content) as ConversationRecord;

    const resumedData: ResumedSessionData = {
      conversation,
      filePath: targetFile.filePath,
    };

    return new GeminiCliSession(
      this.options,
      conversation.sessionId,
      this,
      resumedData,
    );
  }
}
