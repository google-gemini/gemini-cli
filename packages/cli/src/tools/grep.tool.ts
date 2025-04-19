/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Import core logic and types from the server package
import { GrepLogic, GrepToolParams, ToolResult } from '@gemini-code/server';

// Import CLI-specific base class and types
import { BaseTool } from './tools.js';
import { ToolCallConfirmationDetails } from '../ui/types.js';

// --- Interfaces (Params defined in server package) ---

// --- GrepTool CLI Wrapper Class ---

/**
 * CLI wrapper for the Grep tool
 */
export class GrepTool extends BaseTool<GrepToolParams, ToolResult> {
  static readonly Name: string = GrepLogic.Name; // Use name from logic

  // Core logic instance from the server package
  private coreLogic: GrepLogic;

  /**
   * Creates a new instance of the GrepTool CLI wrapper
   * @param rootDirectory Root directory to ground this tool in.
   */
  constructor(rootDirectory: string) {
    // Instantiate the core logic from the server package
    const coreLogicInstance = new GrepLogic(rootDirectory);

    // Initialize the CLI BaseTool
    super(
      GrepTool.Name,
      'SearchText', // Define display name here
      'Searches for a regular expression pattern within the content of files in a specified directory (or current working directory). Can filter files by a glob pattern. Returns the lines containing matches, along with their file paths and line numbers.', // Define description here
      (coreLogicInstance.schema.parameters as Record<string, unknown>) ?? {},
    );

    this.coreLogic = coreLogicInstance;
  }

  /**
   * Delegates validation to the core logic
   */
  validateToolParams(params: GrepToolParams): string | null {
    return this.coreLogic.validateToolParams(params);
  }

  /**
   * Delegates getting description to the core logic
   */
  getDescription(params: GrepToolParams): string {
    return this.coreLogic.getDescription(params);
  }

  /**
   * Define confirmation behavior (Grep likely doesn't need confirmation)
   */
  shouldConfirmExecute(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: GrepToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    return Promise.resolve(false);
  }

  /**
   * Delegates execution to the core logic
   */
  async execute(params: GrepToolParams): Promise<ToolResult> {
    return this.coreLogic.execute(params);
  }

  // Removed private methods (resolveAndValidatePath, performGrepSearch, etc.)
  // as they are now part of GrepLogic in the server package.
}
