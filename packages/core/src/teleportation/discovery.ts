/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { trajectoryToJson } from './teleporter.js';
import { convertAgyToCliRecord } from './converter.js';
import { partListUnionToString } from '../core/geminiRequest.js';

export interface AgySessionInfo {
  id: string;
  path: string;
  mtime: string;
  displayName?: string;
  messageCount?: number;
}

const AGY_CONVERSATIONS_DIR = path.join(
  os.homedir(),
  '.gemini',
  'jetski',
  'conversations',
);

/**
 * Lists all Antigravity sessions found on disk.
 */
export async function listAgySessions(): Promise<AgySessionInfo[]> {
  try {
    const files = await fs.readdir(AGY_CONVERSATIONS_DIR);
    const sessions: AgySessionInfo[] = [];

    for (const file of files) {
      if (file.endsWith('.pb')) {
        const filePath = path.join(AGY_CONVERSATIONS_DIR, file);
        const stats = await fs.stat(filePath);
        const id = path.basename(file, '.pb');

        let details = {};
        try {
          const data = await fs.readFile(filePath);
          const json = trajectoryToJson(data);
          details = extractAgyDetails(json);
        } catch (_error) {
          // Ignore errors during parsing
        }

        sessions.push({
          id,
          path: filePath,
          mtime: stats.mtime.toISOString(),
          ...details,
        });
      }
    }

    return sessions;
  } catch (_error) {
    // If directory doesn't exist, just return empty list
    return [];
  }
}

function extractAgyDetails(json: unknown): {
  displayName?: string;
  messageCount?: number;
} {
  try {
    const record = convertAgyToCliRecord(json);
    const messages = record.messages || [];

    // Find first user message for display name
    const firstUserMsg = messages.find((m) => m.type === 'user');
    const displayName = firstUserMsg
      ? partListUnionToString(firstUserMsg.content).slice(0, 100)
      : 'Antigravity Session';

    return {
      displayName,
      messageCount: messages.length,
    };
  } catch (_error) {
    return {};
  }
}

/**
 * Loads the raw binary data of an Antigravity session.
 */
export async function loadAgySession(id: string): Promise<Buffer | null> {
  const filePath = path.join(AGY_CONVERSATIONS_DIR, `${id}.pb`);
  try {
    return await fs.readFile(filePath);
  } catch (_error) {
    return null;
  }
}
