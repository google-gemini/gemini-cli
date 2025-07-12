/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration } from '@google/genai';
import { VirtualToolDefinition } from './virtual-tool-types.js';

export class ManifestParser {
  /**
   * Parses the content of a GEMINI.md file to find and extract virtual tool definitions.
   * @param manifestContent The string content of the GEMINI.md file.
   * @param manifestPath The path to the file, used for logging errors.
   * @returns A promise that resolves to an array of VirtualToolDefinition objects.
   */
  static async parse(
    manifestContent: string,
    manifestPath: string,
  ): Promise<VirtualToolDefinition[]> {
    const toolDefinitions: VirtualToolDefinition[] = [];

    // 1. Find the start of the tools section. If not present, return empty.
    const toolsHeaderIndex = manifestContent.indexOf('\n### Tools\n');
    if (toolsHeaderIndex === -1) {
      return [];
    }
    const toolsSection = manifestContent.substring(toolsHeaderIndex);

    // 2. Split the tools section by level-4 headers and process each tool
    const toolSections = toolsSection.split(/^####\s+/gm).slice(1); // Skip the first empty element
    const toolHeaders = [...toolsSection.matchAll(/^####\s+([\w-]+)/gm)];

    for (let i = 0; i < toolSections.length && i < toolHeaders.length; i++) {
      const toolName = toolHeaders[i][1].trim();
      const toolBody = toolSections[i];

      // 3. Extract the script and schema from the tool's body.
      const script = this.extractCodeBlock(toolBody, 'sh');
      const schemaJson = this.extractCodeBlock(toolBody, 'json');

      if (!script || !schemaJson) {
        console.warn(
          `[ManifestParser] Skipping tool '${toolName}' from '${manifestPath}': Missing 'sh' or 'json' code block.`,
        );
        continue;
      }

      // 4. Parse the JSON schema safely.
      try {
        const schema: FunctionDeclaration = JSON.parse(schemaJson);

        // Basic validation: ensure parsed schema matches the tool name.
        if (schema.name !== toolName) {
          console.warn(
            `[ManifestParser] Skipping tool '${toolName}' from '${manifestPath}': Name in schema ('${schema.name}') does not match header name.`,
          );
          continue;
        }

        toolDefinitions.push({ name: toolName, schema, script });
      } catch (e) {
        console.warn(
          `[ManifestParser] Skipping tool '${toolName}' from '${manifestPath}': Failed to parse JSON schema. Error: ${(e as Error).message}`,
        );
      }
    }

    return toolDefinitions;
  }

  /**
   * Helper to extract content from a fenced code block.
   * @param body The text to search within.
   * @param lang The language of the code block (e.g., 'sh', 'json').
   * @returns The content of the code block, or null if not found.
   */
  private static extractCodeBlock(
    body: string,
    lang: 'sh' | 'json',
  ): string | null {
    // Look for ```lang or ``` lang (with optional space) followed by content until closing ```
    const regex = new RegExp(
      `\`\`\`\\s*${lang}\\s*\\n([\\s\\S]*?)\\n\`\`\``,
      'i',
    );
    const match = body.match(regex);
    if (match) {
      return match[1].trim();
    }

    // Fallback: Look for ```lang without newlines but allowing spaces
    const fallbackRegex = new RegExp(
      `\`\`\`\\s*${lang}\\s*([\\s\\S]*?)\`\`\``,
      'i',
    );
    const fallbackMatch = body.match(fallbackRegex);
    if (fallbackMatch) {
      return fallbackMatch[1].trim();
    }

    return null;
  }
}
