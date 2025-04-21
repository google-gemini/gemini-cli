/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolListUnion, FunctionDeclaration } from '@google/genai';
import { Tool } from './tools.js';

export class ToolRegistry {
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
   * Retrieves the list of tool schemas (FunctionDeclaration array).
   * Extracts the declarations from the ToolListUnion structure.
   * @returns An array of FunctionDeclarations.
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    const declarations: FunctionDeclaration[] = [];
    this.tools.forEach((tool) => {
      declarations.push(tool.schema);
    });
    return declarations;
  }

  /**
   * Deprecated/Internal? Retrieves schemas in the ToolListUnion format.
   * Kept for reference, prefer getFunctionDeclarations.
   */
  getToolSchemas(): ToolListUnion {
    const declarations = this.getFunctionDeclarations();
    if (declarations.length === 0) {
      return [];
    }
    return [{ functionDeclarations: declarations }];
  }

  /**
   * Returns an array of all registered tool instances.
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
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
