/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
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
  workspaceUri?: string;
}

const AGY_CONVERSATIONS_DIR = path.join(
  os.homedir(),
  '.gemini',
  'jetski',
  'conversations',
);

/**
 * Lists all Antigravity sessions found on disk.
 * @param filterWorkspaceUri Optional filter to only return sessions matching this workspace URI (e.g. "file:///...").
 */
export async function listAgySessions(
  filterWorkspaceUri?: string,
): Promise<AgySessionInfo[]> {
  try {
    const files = await fs.readdir(AGY_CONVERSATIONS_DIR);
    const sessions: AgySessionInfo[] = [];

    for (const file of files) {
      if (file.endsWith('.pb')) {
        const filePath = path.join(AGY_CONVERSATIONS_DIR, file);
        const stats = await fs.stat(filePath);
        const id = path.basename(file, '.pb');

        let details: ReturnType<typeof extractAgyDetails> = {};
        try {
          const data = await fs.readFile(filePath);
          const json = trajectoryToJson(data);
          details = extractAgyDetails(json);
        } catch (_error) {
          // Ignore errors during parsing
        }

        if (
          filterWorkspaceUri &&
          details.workspaceUri &&
          details.workspaceUri !== filterWorkspaceUri
        ) {
          continue; // Skip sessions from other workspaces if we have a filter
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
  workspaceUri?: string;
} {
  try {
    const record = convertAgyToCliRecord(json);
    const messages = record.messages || [];

    // Find first user message for display name
    const firstUserMsg = messages.find((m) => m.type === 'user');
    const displayName = firstUserMsg
      ? partListUnionToString(firstUserMsg.content).slice(0, 100)
      : 'Antigravity Session';

    // Attempt to extract authoritative workspace object from top-level metadata first
    let workspaceUri: string | undefined;
    const agyJson = json as Record<string, unknown>;

    const metadata = agyJson['metadata'] as Record<string, unknown> | undefined;
    if (metadata) {
      const workspaces = metadata['workspaces'] as
        | Array<Record<string, unknown>>
        | undefined;
      const firstWorkspace = workspaces?.[0];
      if (firstWorkspace && firstWorkspace['workspaceFolderAbsoluteUri']) {
        workspaceUri = firstWorkspace['workspaceFolderAbsoluteUri'] as string;
      }
    }

    // Fallback: Attempt to extract workspace object from raw JSON steps (e.g. older offline trajectories)
    if (!workspaceUri) {
      const steps = (agyJson['steps'] as Array<Record<string, unknown>>) || [];
      for (const step of steps) {
        const userInput = step['userInput'] as
          | Record<string, unknown>
          | undefined;
        if (userInput) {
          const activeState = userInput['activeUserState'] as
            | Record<string, unknown>
            | undefined;
          const activeDoc = activeState?.['activeDocument'] as
            | Record<string, unknown>
            | undefined;
          if (activeDoc && activeDoc['workspaceUri']) {
            workspaceUri = activeDoc['workspaceUri'] as string;
            break;
          }
        }
      }
    }

    return {
      displayName,
      messageCount: messages.length,
      workspaceUri,
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
