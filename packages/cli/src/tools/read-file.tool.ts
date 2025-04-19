/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ReadFileLogic,
  ReadFileToolParams,
  ToolResult,
} from '@gemini-code/server';
import { BaseTool } from './tools.js';
import { ToolCallConfirmationDetails } from '../ui/types.js';

/**
 * CLI wrapper for the ReadFile tool
 */
export class ReadFileTool extends BaseTool<ReadFileToolParams, ToolResult> {
  static readonly Name: string = ReadFileLogic.Name;
  private coreLogic: ReadFileLogic;

  /**
   * Creates a new instance of the ReadFileTool CLI wrapper
   * @param rootDirectory Root directory to ground this tool in.
   */
  constructor(rootDirectory: string) {
    const coreLogicInstance = new ReadFileLogic(rootDirectory);
    super(
      ReadFileTool.Name,
      'ReadFile',
      'Reads and returns the content of a specified file from the local filesystem. Handles large files by allowing reading specific line ranges.',
      (coreLogicInstance.schema.parameters as Record<string, unknown>) ?? {},
    );
    this.coreLogic = coreLogicInstance;
  }

  /**
   * Delegates validation to the core logic
   */
  validateToolParams(_params: ReadFileToolParams): string | null {
    // Currently allowing any path. Add validation if needed.
    return null;
  }

  /**
   * Delegates getting description to the core logic
   */
  getDescription(_params: ReadFileToolParams): string {
    return this.coreLogic.getDescription(_params);
  }

  /**
   * Define confirmation behavior here in the CLI wrapper if needed
   * For ReadFile, we likely don't need confirmation.
   */
  shouldConfirmExecute(
    _params: ReadFileToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    return Promise.resolve(false);
  }

  /**
   * Delegates execution to the core logic
   */
  async execute(params: ReadFileToolParams): Promise<ToolResult> {
    return this.coreLogic.execute(params);
  }
}
