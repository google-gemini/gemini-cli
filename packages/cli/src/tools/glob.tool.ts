/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Import core logic and types from the server package
import { GlobLogic, GlobToolParams, ToolResult } from '@gemini-code/server';

// Import CLI-specific base class and types
import { BaseTool } from './tools.js';
import { ToolCallConfirmationDetails } from '../ui/types.js';

/**
 * CLI wrapper for the Glob tool
 */
export class GlobTool extends BaseTool<GlobToolParams, ToolResult> {
  static readonly Name: string = GlobLogic.Name; // Use name from logic

  // Core logic instance from the server package
  private coreLogic: GlobLogic;

  /**
   * Creates a new instance of the GlobTool CLI wrapper
   * @param rootDirectory Root directory to ground this tool in.
   */
  constructor(rootDirectory: string) {
    // Instantiate the core logic from the server package
    const coreLogicInstance = new GlobLogic(rootDirectory);

    // Initialize the CLI BaseTool
    super(
      GlobTool.Name,
      'FindFiles', // Define display name here
      'Efficiently finds files matching specific glob patterns (e.g., `src/**/*.ts`, `**/*.md`), returning absolute paths sorted by modification time (newest first). Ideal for quickly locating files based on their name or path structure, especially in large codebases.', // Define description here
      (coreLogicInstance.schema.parameters as Record<string, unknown>) ?? {},
    );

    this.coreLogic = coreLogicInstance;
  }

  /**
   * Delegates validation to the core logic
   */
  validateToolParams(params: GlobToolParams): string | null {
    return this.coreLogic.validateToolParams(params);
  }

  /**
   * Delegates getting description to the core logic
   */
  getDescription(params: GlobToolParams): string {
    return this.coreLogic.getDescription(params);
  }

  /**
   * Define confirmation behavior (Glob likely doesn't need confirmation)
   */
  shouldConfirmExecute(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: GlobToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    return Promise.resolve(false);
  }

  /**
   * Delegates execution to the core logic
   */
  async execute(params: GlobToolParams): Promise<ToolResult> {
    return this.coreLogic.execute(params);
  }

  // Removed private methods (isWithinRoot)
  // as they are now part of GlobLogic in the server package.
}
