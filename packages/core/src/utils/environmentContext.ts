/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import type { Part, Content } from '@google/genai';
import type { Config } from '../config/config.js';
import { getFolderStructure } from './getFolderStructure.js';
import { getShellConfiguration } from './shell-utils.js';

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
  let platform: string = process.platform;
  if (process.platform === 'win32') {
    // Provide richer context for Windows so the model generates correct commands
    const shellConfig = getShellConfiguration();
    const release = os.release();
    const isWT = Boolean(process.env['WT_SESSION']);
    const terminal = isWT ? 'Windows Terminal' : 'conhost';
    platform = `win32 (Windows ${release}, shell: ${shellConfig.shell}, terminal: ${terminal})`;
  } else if (process.platform === 'linux') {
    // Detect WSL so the model knows the user is on Windows via WSL
    try {
      const fs = await import('node:fs');
      const procVersion = fs.readFileSync('/proc/version', 'utf-8');
      if (/microsoft|wsl/i.test(procVersion)) {
        const distro = process.env['WSL_DISTRO_NAME'] ?? 'unknown';
        platform = `linux (WSL2, distro: ${distro})`;
      }
    } catch {
      // Not WSL or /proc/version not readable
    }
  }
  const directoryContext = config.getIncludeDirectoryTree()
    ? await getDirectoryContextString(config)
    : '';
  const tempDir = config.storage.getProjectTempDir();
  const environmentMemory = config.getEnvironmentMemory();

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
