/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import {
  EditLogic,
  EditToolParams,
  ToolResult,
  makeRelative,
  shortenPath,
  isNodeError,
} from '@gemini-code/server';
import { BaseTool } from './tools.js';
import {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
} from '../ui/types.js';
import * as Diff from 'diff';

/**
 * CLI wrapper for the Edit tool.
 * Handles confirmation prompts and potentially UI-specific state like 'Always Edit'.
 */
export class EditTool extends BaseTool<EditToolParams, ToolResult> {
  static readonly Name: string = EditLogic.Name;
  private coreLogic: EditLogic;
  private shouldAlwaysEdit = false;

  /**
   * Creates a new instance of the EditTool CLI wrapper
   * @param rootDirectory Root directory to ground this tool in.
   */
  constructor(rootDirectory: string) {
    const coreLogicInstance = new EditLogic(rootDirectory);
    super(
      EditTool.Name,
      'Edit',
      `Replaces a SINGLE, UNIQUE occurrence of text within a file. Requires providing significant context around the change to ensure uniqueness. For moving/renaming files, use the Bash tool with \`mv\`. For replacing entire file contents or creating new files use the WriteFile tool. Always use the ReadFile tool to examine the file before using this tool.`,
      (coreLogicInstance.schema.parameters as Record<string, unknown>) ?? {},
    );
    this.coreLogic = coreLogicInstance;
  }

  /**
   * Delegates validation to the core logic
   */
  validateToolParams(params: EditToolParams): string | null {
    return this.coreLogic.validateParams(params);
  }

  /**
   * Delegates getting description to the core logic
   */
  getDescription(params: EditToolParams): string {
    return this.coreLogic.getDescription(params);
  }

  /**
   * Handles the confirmation prompt for the Edit tool in the CLI.
   * It needs to calculate the diff to show the user.
   */
  async shouldConfirmExecute(
    params: EditToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.shouldAlwaysEdit) {
      return false;
    }
    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(
        `[EditTool Wrapper] Attempted confirmation with invalid parameters: ${validationError}`,
      );
      return false;
    }
    let currentContent: string | null = null;
    let fileExists = false;
    let newContent = '';
    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
      fileExists = true;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        fileExists = false;
      } else {
        console.error(`Error reading file for confirmation diff: ${err}`);
        return false;
      }
    }
    if (params.old_string === '' && !fileExists) {
      newContent = params.new_string;
    } else if (!fileExists) {
      return false;
    } else if (currentContent !== null) {
      const occurrences = this.coreLogic['countOccurrences'](
        currentContent,
        params.old_string,
      );
      const expectedReplacements =
        params.expected_replacements === undefined
          ? 1
          : params.expected_replacements;
      if (occurrences === 0 || occurrences !== expectedReplacements) {
        return false;
      }
      newContent = this.coreLogic['replaceAll'](
        currentContent,
        params.old_string,
        params.new_string,
      );
    } else {
      return false;
    }
    const fileName = path.basename(params.file_path);
    const fileDiff = Diff.createPatch(
      fileName,
      currentContent ?? '',
      newContent,
      'Current',
      'Proposed',
      { context: 3 },
    );
    const confirmationDetails: ToolEditConfirmationDetails = {
      title: `Confirm Edit: ${shortenPath(makeRelative(params.file_path, this.coreLogic['rootDirectory']))}`,
      fileName,
      fileDiff,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.shouldAlwaysEdit = true;
        }
      },
    };
    return confirmationDetails;
  }

  /**
   * Delegates execution to the core logic
   */
  async execute(params: EditToolParams): Promise<ToolResult> {
    return this.coreLogic.execute(params);
  }
}
