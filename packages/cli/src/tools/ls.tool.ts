/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Import core logic and types from the server package
import { LSLogic, LSToolParams, ToolResult } from '@gemini-code/server';

// Import CLI-specific base class and types
import { BaseTool } from './tools.js';
import { ToolCallConfirmationDetails } from '../ui/types.js';

/**
 * CLI wrapper for the LS tool
 */
export class LSTool extends BaseTool<LSToolParams, ToolResult> {
  static readonly Name: string = LSLogic.Name; // Use name from logic

  // Core logic instance from the server package
  private coreLogic: LSLogic;

  /**
   * Creates a new instance of the LSTool CLI wrapper
   * @param rootDirectory Root directory to ground this tool in.
   */
  constructor(rootDirectory: string) {
    // Instantiate the core logic from the server package
    const coreLogicInstance = new LSLogic(rootDirectory);

    // Initialize the CLI BaseTool
    super(
      LSTool.Name,
      'ReadFolder', // Define display name here
      'Lists the names of files and subdirectories directly within a specified directory path. Can optionally ignore entries matching provided glob patterns.', // Define description here
      (coreLogicInstance.schema.parameters as Record<string, unknown>) ?? {},
    );

    this.coreLogic = coreLogicInstance;
  }

  /**
   * Delegates validation to the core logic
   */
  validateToolParams(params: LSToolParams): string | null {
    return this.coreLogic.validateToolParams(params);
  }

  /**
   * Delegates getting description to the core logic
   */
  getDescription(params: LSToolParams): string {
    return this.coreLogic.getDescription(params);
  }

  /**
   * Define confirmation behavior (LS likely doesn't need confirmation)
   */
  shouldConfirmExecute(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: LSToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    return Promise.resolve(false);
  }

  /**
   * Delegates execution to the core logic
   */
  async execute(params: LSToolParams): Promise<ToolResult> {
    // The CLI wrapper could potentially modify the returnDisplay
    // from the core logic if needed, but for LS, the core logic's
    // display might be sufficient.
    return this.coreLogic.execute(params);
  }

  // Removed private methods (isWithinRoot, shouldIgnore, errorResult)
  // as they are now part of LSLogic in the server package.
}
