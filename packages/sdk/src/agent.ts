/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

  async resumeSession(sessionId: string): Promise<GeminiCliSession> {
    const cwd = this.options.cwd || process.cwd();
    const storage = new Storage(cwd);
    await storage.initialize();

    let conversation: ConversationRecord | undefined;
    let filePath: string | undefined;

    const sessions = await storage.listProjectChatFiles();

    if (sessions.length === 0) {
      throw new Error(
        `No sessions found in ${path.join(storage.getProjectTempDir(), 'chats')}`,
      );
    }

    const truncatedId = sessionId.slice(0, 8);
    // Optimization: filenames include first 8 chars of sessionId.
    // Filter sessions that might match.
    const candidates = sessions.filter((s) => s.filePath.includes(truncatedId));

    // If optimization fails (e.g. old files), check all?
    // Assuming filenames always follow convention if created by this tool.
    // But we can fallback to checking all if needed, but let's stick to candidates first.
    // If candidates is empty, maybe fallback to all.
    const filesToCheck = candidates.length > 0 ? candidates : sessions;

    for (const sessionFile of filesToCheck) {
      const loaded = await storage.loadProjectTempFile<ConversationRecord>(
        sessionFile.filePath,
      );
      if (loaded && loaded.sessionId === sessionId) {
        conversation = loaded;
        filePath = path.join(storage.getProjectTempDir(), sessionFile.filePath);
        break;
      }
    }

    if (!conversation || !filePath) {
      throw new Error(`Session with ID ${sessionId} not found`);
    }

    const resumedData: ResumedSessionData = {
      conversation,
      filePath,
    };

    return new GeminiCliSession(
      this.options,
      conversation.sessionId,
      this,
      resumedData,
    );
  }
}
