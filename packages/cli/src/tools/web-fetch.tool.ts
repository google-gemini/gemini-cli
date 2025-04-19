/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Import core logic and types from the server package
import {
  WebFetchLogic,
  WebFetchToolParams,
  ToolResult,
} from '@gemini-code/server';

// Import CLI-specific base class and UI types
import { BaseTool } from './tools.js';
import { ToolCallConfirmationDetails } from '../ui/types.js';

/**
 * CLI wrapper for the WebFetch tool.
 */
export class WebFetchTool extends BaseTool<WebFetchToolParams, ToolResult> {
  static readonly Name: string = WebFetchLogic.Name; // Use name from logic

  // Core logic instance from the server package
  private coreLogic: WebFetchLogic;

  constructor() {
    const coreLogicInstance = new WebFetchLogic();
    super(
      WebFetchTool.Name,
      'WebFetch', // Define display name here
      'Fetches text content from a given URL. Handles potential network errors and non-success HTTP status codes.', // Define description here
      (coreLogicInstance.schema.parameters as Record<string, unknown>) ?? {},
    );
    this.coreLogic = coreLogicInstance;
  }

  validateToolParams(params: WebFetchToolParams): string | null {
    // Delegate validation to core logic
    return this.coreLogic.validateParams(params);
  }

  getDescription(params: WebFetchToolParams): string {
    // Delegate description generation to core logic
    return this.coreLogic.getDescription(params);
  }

  /**
   * Define confirmation behavior (WebFetch likely doesn't need confirmation)
   */
  async shouldConfirmExecute(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: WebFetchToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    return Promise.resolve(false);
  }

  /**
   * Delegates execution to the core logic.
   */
  async execute(params: WebFetchToolParams): Promise<ToolResult> {
    return this.coreLogic.execute(params);
  }
}
