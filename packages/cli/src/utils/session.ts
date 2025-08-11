/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { getProjectTempDir } from '@google/gemini-cli-core';
import { Content } from '@google/genai';

const SESSIONS_DIR_NAME = 'sessions';

export async function saveSession(history: Content[]) {
  const tempDir = getProjectTempDir(process.cwd());
  const sessionsDir = join(tempDir, SESSIONS_DIR_NAME);
  await fs.mkdir(sessionsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `session-${timestamp}.json`;
  const filePath = join(sessionsDir, fileName);

  await fs.writeFile(filePath, JSON.stringify(history, null, 2));
  console.log(`Session saved to ${filePath}`);
}

export async function loadSession(
  sessionId: string,
): Promise<Content[] | null> {
  const tempDir = getProjectTempDir(process.cwd());
  const sessionsDir = join(tempDir, SESSIONS_DIR_NAME);
  const filePath = join(sessionsDir, `${sessionId}.json`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Content[];
  } catch (error) {
    console.error(`Failed to load session ${sessionId}: ${error}`);
    return null;
  }
}

export async function listSessions(): Promise<
  Array<{ shortId: number; fullId: string; timestamp: string }>
> {
  const tempDir = getProjectTempDir(process.cwd());
  const sessionsDir = join(tempDir, SESSIONS_DIR_NAME);

  try {
    const files = await fs.readdir(sessionsDir);
    const sessionFiles = files.filter(
      (file) => file.startsWith('session-') && file.endsWith('.json'),
    );

    const filesWithStats = await Promise.all(
      sessionFiles.map(async (file) => {
        const filePath = join(sessionsDir, file);
        const stats = await fs.stat(filePath);
        return { file, mtimeMs: stats.mtimeMs };
      }),
    );

    // Sort by modification time, newest first, which is reliable
    filesWithStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

    return filesWithStats.map((item, index) => ({
      shortId: index + 1,
      fullId: item.file.replace('.json', ''),
      timestamp: new Date(item.mtimeMs).toLocaleString(),
    }));
  } catch (error) {
    console.warn(`Could not list sessions: ${error}`);
    return [];
  }
}

export async function getLatestSession(): Promise<string | null> {
  const sessions = await listSessions();
  return sessions.length > 0 ? sessions[0].fullId : null;
}

/**
 * Finds a session by input (either short ID number or full session ID)
 * @param input - Either a short ID number (e.g., "1", "2") or full session ID
 * @returns The full session ID if found, null if not found
 */
export async function findSession(input: string): Promise<string | null> {
  if (!input.trim()) {
    return null;
  }

  const trimmedInput = input.trim();
  
  // Check if input is a number (short ID)
  const shortId = parseInt(trimmedInput, 10);
  
  if (!isNaN(shortId) && shortId > 0) {
    // Input is a number, look up the full session ID
    const sessions = await listSessions();
    const targetSession = sessions.find(s => s.shortId === shortId);
    return targetSession ? targetSession.fullId : null;
  }
  
  // Input is already a full session ID, return as-is
  return trimmedInput;
}
