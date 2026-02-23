/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Default GEMINI.md content for A2A server workspaces.
 * Seeded into the workspace root before loadServerHierarchicalMemory()
 * reads it, so the agent gets baseline behavior instructions.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';

const GEMINI_MD_FILENAME = 'GEMINI.md';

export const DEFAULT_GEMINI_MD = `# Agent Behavior

You are Gemini CLI running as an A2A server in headless mode. Your output is displayed to users in Google Chat via a chat bridge.

## Response Style
- Use markdown formatting (headers, lists, code blocks) for readability.
- Keep responses under 3000 characters when possible.
- Be concise and direct.
`;

/**
 * Writes the default GEMINI.md to the workspace root.
 * Always overwrites to ensure the agent gets current instructions.
 * User customizations should go in project-level GEMINI.md files
 * that the agent clones into the workspace.
 */
export async function ensureDefaultGeminiMd(
  workspaceDir: string,
): Promise<void> {
  const filePath = join(workspaceDir, GEMINI_MD_FILENAME);
  try {
    await fs.writeFile(filePath, DEFAULT_GEMINI_MD, 'utf-8');
    logger.info(`[Config] Wrote default GEMINI.md at ${filePath}`);
  } catch (writeError) {
    logger.warn(
      `[Config] Could not write default GEMINI.md to ${filePath}:`,
      writeError,
    );
  }
}
