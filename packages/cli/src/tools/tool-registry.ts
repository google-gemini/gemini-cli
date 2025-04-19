/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolListUnion, FunctionDeclaration } from '@google/genai';
import { Tool } from './tools.js';

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /**
   * Registers a tool definition.
   * @param tool - The tool object containing schema and execution logic.
   */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      // Decide on behavior: throw error, log warning, or allow overwrite
      console.warn(
        `Tool with name "${tool.name}" is already registered. Overwriting.`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Retrieves the list of tool schemas in the format required by Gemini.
   * @returns A ToolListUnion containing the function declarations.
   */
  getToolSchemas(): ToolListUnion {
    const declarations: FunctionDeclaration[] = [];
    this.tools.forEach((tool) => {
      declarations.push(tool.schema);
    });

    // Return Gemini's expected format. Handle the case of no tools.
    if (declarations.length === 0) {
      // Depending on the SDK version, you might need `undefined`, `[]`, or `[{ functionDeclarations: [] }]`
      // Check the documentation for your @google/genai version.
      // Let's assume an empty array works or signifies no tools.
      return [];
      // Or if it requires the structure:
      // return [{ functionDeclarations: [] }];
    }
    return [{ functionDeclarations: declarations }];
  }

  /**
   * Optional: Get a list of registered tool names.
   */
  listAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get the definition of a specific tool.
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }
}

// Export a singleton instance of the registry
export const toolRegistry = new ToolRegistry();
