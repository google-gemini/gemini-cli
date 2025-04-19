/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import * as Diff from 'diff';
import {
  WriteFileLogic,
  WriteFileToolParams,
  ToolResult,
  makeRelative,
  shortenPath,
} from '@gemini-code/server';
import { BaseTool } from './tools.js';
import {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
} from '../ui/types.js';

/**
 * CLI wrapper for the WriteFile tool.
 */
export class WriteFileTool extends BaseTool<WriteFileToolParams, ToolResult> {
  static readonly Name: string = WriteFileLogic.Name;
  private shouldAlwaysWrite = false;

  private coreLogic: WriteFileLogic;

  constructor(rootDirectory: string) {
    const coreLogicInstance = new WriteFileLogic(rootDirectory);
    super(
      WriteFileTool.Name,
      'WriteFile',
      'Writes content to a specified file in the local filesystem.',
      (coreLogicInstance.schema.parameters as Record<string, unknown>) ?? {},
    );
    this.coreLogic = coreLogicInstance;
  }

  validateToolParams(params: WriteFileToolParams): string | null {
    return this.coreLogic.validateParams(params);
  }

  getDescription(params: WriteFileToolParams): string {
    return this.coreLogic.getDescription(params);
  }

  /**
   * Handles the confirmation prompt for the WriteFile tool in the CLI.
   */
  async shouldConfirmExecute(
    params: WriteFileToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.shouldAlwaysWrite) {
      return false;
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(
        `[WriteFile Wrapper] Attempted confirmation with invalid parameters: ${validationError}`,
      );
      return false;
    }

    const relativePath = makeRelative(
      params.file_path,
      this.coreLogic['rootDirectory'],
    );
    const fileName = path.basename(params.file_path);

    let currentContent = '';
    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
    } catch {
      // File might not exist, that's okay for write/create
    }

    const fileDiff = Diff.createPatch(
      fileName,
      currentContent,
      params.content,
      'Current',
      'Proposed',
      { context: 3 },
    );

    const confirmationDetails: ToolEditConfirmationDetails = {
      title: `Confirm Write: ${shortenPath(relativePath)}`,
      fileName,
      fileDiff,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.shouldAlwaysWrite = true;
        }
      },
    };
    return confirmationDetails;
  }

  /**
   * Delegates execution to the core logic.
   */
  async execute(params: WriteFileToolParams): Promise<ToolResult> {
    return this.coreLogic.execute(params);
  }
}
