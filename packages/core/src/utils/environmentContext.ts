/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Part } from '@google/genai';
import { Config } from '../config/config.js';
import { getFolderStructure } from './getFolderStructure.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';

/**
 * Retrieves environment-related information to be included in the chat context.
 * This includes the current working directory, date, operating system, and folder structure.
 * Optionally, it can also include the full file context if enabled.
 * @param {Config} config - The runtime configuration and services.
 * @returns A promise that resolves to an array of `Part` objects containing environment information.
 */
export async function getEnvironmentContext(config: Config): Promise<Part[]> {
  const cwd = config.getWorkingDir();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const platform = process.platform;
  const folderStructure = await getFolderStructure(cwd, {
    fileService: config.getFileService(),
  });
  const context = `
This is the Gemini CLI. We are setting up the context for our chat.
Today's date is ${today}.
My operating system is: ${platform}
I'm currently working in the directory: ${cwd}
${folderStructure}
        `.trim();

  const initialParts: Part[] = [{ text: context }];
  const toolRegistry = await config.getToolRegistry();

  // Add full file context if the flag is set
  if (config.getFullContext()) {
    try {
      const readManyFilesTool = toolRegistry.getTool(
        'read_many_files',
      ) as ReadManyFilesTool;
      if (readManyFilesTool) {
        // Read all files in the target directory
        const result = await readManyFilesTool.execute(
          {
            paths: ['**/*'], // Read everything recursively
            useDefaultExcludes: true, // Use default excludes
          },
          AbortSignal.timeout(30000),
        );
        const content = result.llmContent;
        let hasContent = false;
        if (typeof content === 'string') {
          hasContent = content.length > 0;
        } else if (Array.isArray(content)) {
          hasContent = content.length > 0;
        } else if (content) {
          // It's a single Part object, which we consider as content if it exists.
          hasContent = true;
        }

        if (hasContent) {
          initialParts.push({
            text: `\n--- Full File Context ---\n${content}`,
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
