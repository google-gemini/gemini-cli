/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, Icon, ToolResult } from './tools.js';
import { FunctionDeclaration, Type } from '@google/genai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

const memoryToolSchemaData: FunctionDeclaration = {
  name: 'save_memory',
  description:
    'Saves a specific piece of information or fact to your long-term memory. Use this when the user explicitly asks you to remember something, or when they state a clear, concise fact that seems important to retain for future interactions.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      fact: {
        type: Type.STRING,
        description:
          'The specific fact or piece of information to remember. Should be a clear, self-contained statement.',
      },
    },
    required: ['fact'],
  },
};

const memoryToolDescription = `
Saves a specific piece of information or fact to your long-term memory.

Use this tool:

- When the user explicitly asks you to remember something (e.g., "Remember that I like pineapple on pizza", "Please save this: my cat's name is Whiskers").
- When the user states a clear, concise fact about themselves, their preferences, or their environment that seems important for you to retain for future interactions to provide a more personalized and effective assistance.

Do NOT use this tool:

- To remember conversational context that is only relevant for the current session.
- To save long, complex, or rambling pieces of text. The fact should be relatively short and to the point.
- If you are unsure whether the information is a fact worth remembering long-term. If in doubt, you can ask the user, "Should I remember that for you?"

## Parameters

- \`fact\` (string, required): The specific fact or piece of information to remember. This should be a clear, self-contained statement. For example, if the user says "My favorite color is blue", the fact would be "My favorite color is blue".
`;

export const GEMINI_CONFIG_DIR = '.gemini';
export const DEFAULT_CONTEXT_FILENAME = 'GEMINI.md';
export const MEMORY_SECTION_HEADER = '## Gemini Added Memories';

// This variable will hold the currently configured filename for GEMINI.md context files.
// It defaults to DEFAULT_CONTEXT_FILENAME but can be overridden by setGeminiMdFilename.
let currentGeminiMdFilename: string | string[] = DEFAULT_CONTEXT_FILENAME;

export function setGeminiMdFilename(newFilename: string | string[]): void {
  if (Array.isArray(newFilename)) {
    if (newFilename.length > 0) {
      currentGeminiMdFilename = newFilename.map((name) => name.trim());
    }
  } else if (newFilename && newFilename.trim() !== '') {
    currentGeminiMdFilename = newFilename.trim();
  }
}

export function getCurrentGeminiMdFilename(): string {
  if (Array.isArray(currentGeminiMdFilename)) {
    return currentGeminiMdFilename[0];
  }
  return currentGeminiMdFilename;
}

export function getAllGeminiMdFilenames(): string[] {
  if (Array.isArray(currentGeminiMdFilename)) {
    return currentGeminiMdFilename;
  }
  return [currentGeminiMdFilename];
}

interface SaveMemoryParams {
  fact: string;
}

function getGlobalMemoryFilePath(): string {
  return path.join(homedir(), GEMINI_CONFIG_DIR, getCurrentGeminiMdFilename());
}

/**
 * Ensures proper newline separation before appending content.
 */
function ensureNewlineSeparation(currentContent: string): string {
  if (currentContent.length === 0) return '';
  if (currentContent.endsWith('\n\n') || currentContent.endsWith('\r\n\r\n'))
    return '';
  if (currentContent.endsWith('\n') || currentContent.endsWith('\r\n'))
    return '\n';
  return '\n\n';
}

export class MemoryTool extends BaseTool<SaveMemoryParams, ToolResult> {
  static readonly Name: string = memoryToolSchemaData.name!;
  constructor() {
    super(
      MemoryTool.Name,
      'Save Memory',
      memoryToolDescription,
      Icon.LightBulb,
      memoryToolSchemaData.parameters as Record<string, unknown>,
    );
  }

  static async performAddMemoryEntry(
    text: string,
    memoryFilePath: string,
    fsAdapter: {
      readFile: (path: string, encoding: 'utf-8') => Promise<string>;
      writeFile: (
        path: string,
        data: string,
        encoding: 'utf-8',
      ) => Promise<void>;
      mkdir: (
        path: string,
        options: { recursive: boolean },
      ) => Promise<string | undefined>;
    },
  ): Promise<void> {
    let processedText = text.trim();
    // Remove leading hyphens and spaces that might be misinterpreted as markdown list items
    processedText = processedText.replace(/^(-+\s*)+/, '').trim();
    const newMemoryItem = `- ${processedText}`;

    try {
      await fsAdapter.mkdir(path.dirname(memoryFilePath), { recursive: true });
      let content = '';
      try {
        content = await fsAdapter.readFile(memoryFilePath, 'utf-8');
      } catch (_e) {
        // File doesn't exist, will be created with header and item.
      }

      const headerIndex = content.indexOf(MEMORY_SECTION_HEADER);

      if (headerIndex === -1) {
        // Header not found, append header and then the entry
        const separator = ensureNewlineSeparation(content);
        content += `${separator}${MEMORY_SECTION_HEADER}\n${newMemoryItem}\n`;
      } else {
        // Header found, find where to insert the new memory entry
        const startOfSectionContent =
          headerIndex + MEMORY_SECTION_HEADER.length;
        let endOfSectionIndex = content.indexOf('\n## ', startOfSectionContent);
        if (endOfSectionIndex === -1) {
          endOfSectionIndex = content.length; // End of file
        }

        const beforeSectionMarker = content
          .substring(0, startOfSectionContent)
          .trimEnd();
        let sectionContent = content
          .substring(startOfSectionContent, endOfSectionIndex)
          .trimEnd();
        const afterSectionMarker = content.substring(endOfSectionIndex);

        sectionContent += `\n${newMemoryItem}`;
        content =
          `${beforeSectionMarker}\n${sectionContent.trimStart()}\n${afterSectionMarker}`.trimEnd() +
          '\n';
      }
      await fsAdapter.writeFile(memoryFilePath, content, 'utf-8');
    } catch (error) {
      console.error(
        `[MemoryTool] Error adding memory entry to ${memoryFilePath}:`,
        error,
      );
      throw new Error(
        `[MemoryTool] Failed to add memory entry: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async execute(
    params: SaveMemoryParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const { fact } = params;

    if (!fact || typeof fact !== 'string' || fact.trim() === '') {
      const errorMessage = 'Parameter "fact" must be a non-empty string.';
      return {
        llmContent: JSON.stringify({ success: false, error: errorMessage }),
        returnDisplay: `Error: ${errorMessage}`,
      };
    }

    try {
      // Use the static method with actual fs promises
      await MemoryTool.performAddMemoryEntry(fact, getGlobalMemoryFilePath(), {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
      });
      const successMessage = `Okay, I've remembered that: "${fact}"`;
      return {
        llmContent: JSON.stringify({ success: true, message: successMessage }),
        returnDisplay: successMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[MemoryTool] Error executing save_memory for fact "${fact}": ${errorMessage}`,
      );
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Failed to save memory. Detail: ${errorMessage}`,
        }),
        returnDisplay: `Error saving memory: ${errorMessage}`,
      };
    }
  }
}
