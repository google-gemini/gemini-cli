/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { join } from 'node:path';

export interface UsageMetrics {
  turns: number;
  input: number;
  output: number;
  cached: number;
  total: number;
}

/**
 * Scans the session recordings and extracts aggregate token usage and turn counts.
 * This provides an empirical measure of the agent's efficiency and cost.
 *
 * @param tempDir The directory containing the .gemini/tmp folder with recordings.
 */
export function getUsageMetrics(tempDir: string): UsageMetrics {
  const geminiTmpDir = join(tempDir, '.gemini', 'tmp');

  const metrics: UsageMetrics = {
    turns: 0,
    input: 0,
    output: 0,
    cached: 0,
    total: 0,
  };

  if (!fs.existsSync(geminiTmpDir)) {
    return metrics;
  }

  const processDir = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'chats') {
          processChatsDir(fullPath, metrics);
        } else {
          processDir(fullPath);
        }
      }
    }
  };

  processDir(geminiTmpDir);
  return metrics;
}

function processChatsDir(chatsDir: string, metrics: UsageMetrics) {
  const entries = fs.readdirSync(chatsDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(chatsDir, entry.name);
    if (entry.isDirectory()) {
      // Handle subagent sessions stored in subdirectories
      processChatsDir(fullPath, metrics);
    } else if (
      entry.name.endsWith('.json') &&
      entry.name.startsWith('session-')
    ) {
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        if (data.messages && Array.isArray(data.messages)) {
          for (const msg of data.messages) {
            if (msg.type === 'gemini') {
              metrics.turns++;
              if (msg.tokens) {
                metrics.input += msg.tokens.input || 0;
                metrics.output += msg.tokens.output || 0;
                metrics.cached += msg.tokens.cached || 0;
                metrics.total += msg.tokens.total || 0;
              }
            }
          }
        }
      } catch {
        // Ignore parse errors for partially written or corrupted files
      }
    }
  }
}
