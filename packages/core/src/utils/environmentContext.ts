/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';
import type { Config } from '../config/config.js';
import { getFolderStructure } from './getFolderStructure.js';

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

  let workingDirPreamble: string;
  if (workspaceDirectories.length === 1) {
    workingDirPreamble = `I'm currently working in the directory: ${workspaceDirectories[0]}`;
  } else {
    const dirList = workspaceDirectories.map((dir) => `  - ${dir}`).join('\n');
    workingDirPreamble = `I'm currently working in the following directories:\n${dirList}`;
  }

  return `${workingDirPreamble}
Here is the folder structure of the current working directories:

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
  const directoryContext = await getDirectoryContextString(config);

  const context = `
This is the Gemini CLI. We are setting up the context for our chat.
Today's date is ${today} (formatted according to the user's locale).
My operating system is: ${platform}
${directoryContext}
        `.trim();

  const initialParts: Part[] = [{ text: context }];
  const toolRegistry = config.getToolRegistry();

  // Add full file context if the flag is set
  if (config.getFullContext()) {
    try {
      const readManyFilesTool = toolRegistry.getTool('read_many_files');
      if (readManyFilesTool) {
        const invocation = readManyFilesTool.build({
          paths: ['**/*'], // Read everything recursively
          useDefaultExcludes: true, // Use default excludes
        });

        // Read all files in the target directory
        const result = await invocation.execute(AbortSignal.timeout(30000));
        if (result.llmContent) {
          initialParts.push({
            text: `\n--- Full File Context ---\n${result.llmContent}`,
          });
        } else {
          console.warn(
            'Full context requested, but read_many_files returned no content.',
          );
        }
      } else {
        console.warn(
          'Full context requested, but read_many_files tool not found.',
        );
      }
    } catch (error) {
      // Not using reportError here as it's a startup/config phase, not a chat/generation phase error.
      console.error('Error reading full file context:', error);
      initialParts.push({
        text: '\n--- Error reading full file context ---',
      });
    }
  }

  return initialParts;
}
