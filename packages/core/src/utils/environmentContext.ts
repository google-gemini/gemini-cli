/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part, Content } from '@google/genai';
import type { Config } from '../config/config.js';
import { getFolderStructure } from './getFolderStructure.js';

export const INITIAL_HISTORY_LENGTH = 1;

/**
 * Generates a string describing the current workspace directories and their structures.
 * @param {Config} config - The runtime configuration and services.
 * @returns {Promise<string>} A promise that resolves to the directory context string.
 */
export async function getDirectoryContextString(
  config: Config,
): Promise<string> {
  const workspaceContext = config.getWorkspaceContext();
  const workspaceDirectories = workspaceContext.getDirectories();

  const folderStructures = await Promise.all(
    workspaceDirectories.map((dir) =>
      getFolderStructure(dir, {
        fileService: config.getFileService(),
      }),
    ),
  );

  const folderStructure = folderStructures.join('\n');
  const dirList = workspaceDirectories.map((dir) => `  - ${dir}`).join('\n');

  return `- **Workspace Directories:**\n${dirList}
- **Directory Structure:**

${folderStructure}`;
}

/**
 * Retrieves environment-related information to be included in the chat context.
 * This includes the current working directory, date, operating system, and folder structure.
 * Optionally, it can also include the full file context if enabled.
 * @param {Config} config - The runtime configuration and services.
 * @returns A promise that resolves to an array of `Part` objects containing environment information.
 */
export async function getEnvironmentContext(config: Config): Promise<Part[]> {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const platform = process.platform;
  const directoryContext = config.getIncludeDirectoryTree()
    ? await getDirectoryContextString(config)
    : '';
  const tempDir = config.storage.getProjectTempDir();
  // Tiered context model (see issue #11488):
  // - Tier 1 (global): system instruction only
  // - Tier 2 (extension + project): first user message (here)
  // - Tier 3 (subdirectory): tool output (JIT)
  // When JIT is enabled, Tier 2 memory is provided by getSessionMemory().
  // When JIT is disabled, all memory is in the system instruction and
  // getEnvironmentMemory() provides the project memory for this message.
  const environmentMemory = config.isJitContextEnabled?.()
    ? config.getSessionMemory()
    : config.getEnvironmentMemory();

  const context = `
<session_context>
This is the Gemini CLI. We are setting up the context for our chat.
Today's date is ${today} (formatted according to the user's locale).
My operating system is: ${platform}
The project's temporary directory is: ${tempDir}
${directoryContext}

${environmentMemory}
</session_context>`.trim();

  const initialParts: Part[] = [{ text: context }];

  return initialParts;
}

export async function getInitialChatHistory(
  config: Config,
  extraHistory?: Content[],
): Promise<Content[]> {
  const envParts = await getEnvironmentContext(config);
  const envContextString = envParts.map((part) => part.text || '').join('\n\n');

  return [
    {
      role: 'user',
      parts: [{ text: envContextString }],
    },
    ...(extraHistory ?? []),
  ];
}
