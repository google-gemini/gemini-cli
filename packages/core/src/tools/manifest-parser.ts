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

    // 2. Use Regex to find each tool definition block.
    // This regex looks for a level-4 header and captures everything until the next one.
    const toolRegex = /^####\s+([\w-]+)\s*([\s\S]*?)(?=^####\s|$)/gm;

    let match;
    while ((match = toolRegex.exec(toolsSection)) !== null) {
      const toolName = match[1].trim();
      const toolBody = match[2];

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
    // First try: Look for ```lang format
    const langFirstRegex = new RegExp(`\`\`\`${lang}\\s*([\\s\\S]*?)\`\`\``, 'i');
    const langFirstMatch = body.match(langFirstRegex);
    if (langFirstMatch) {
      return langFirstMatch[1].trim();
    }

    // Second try: Look for ``` followed by lang on the same line
    const sameLIneRegex = new RegExp(`\`\`\`\\s*${lang}\\s*([\\s\\S]*?)\`\`\``, 'i');
    const sameLineMatch = body.match(sameLIneRegex);
    if (sameLineMatch) {
      return sameLineMatch[1].trim();
    }

    // Third try: Look for any code block with lang mentioned (fallback)
    const fallbackRegex = new RegExp(
      `\`\`\`[\\s\\S]*?${lang}[\\s\\S]*?([\\s\\S]*?)\`\`\``,
      'i',
    );
    const fallbackMatch = body.match(fallbackRegex);
    if (fallbackMatch) {
      return fallbackMatch[1].trim();
    }

    return null;
  }
}