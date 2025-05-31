/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import * as Diff from 'diff';
import {
  BaseTool,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
  ToolResult,
  ToolResultDisplay,
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import { ReadFileTool } from './read-file.js';
import { GeminiClient } from '../core/client.js';
import { Config } from '../config/config.js';
import { ensureCorrectEdit } from '../utils/editCorrector.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';

/**
 * Parameters for the Edit tool
 */
export interface EditToolParams {
  /**
   * The absolute path to the file to modify
   */
  file_path: string;

  /**
   * The text to replace
   */
  old_string: string;

  /**
   * The text to replace it with
   */
  new_string: string;
}

interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  occurrences: number;
  error?: { display: string; raw: string };
  isNewFile: boolean;
}

/**
 * Implementation of the Edit tool logic
 */
export class EditTool extends BaseTool<EditToolParams, ToolResult> {
  static readonly Name = 'replace';
  private readonly config: Config;
  private readonly rootDirectory: string;
  private readonly client: GeminiClient;

  /**
   * Creates a new instance of the EditLogic
   * @param rootDirectory Root directory to ground this tool in.
   */
  constructor(config: Config) {
    super(
      EditTool.Name,
      'Edit',
      `Replaces a single, unique occurrence of text within a file. This tool requires providing significant context around the change to ensure uniqueness and precise targeting. Always use the ${ReadFileTool} tool to examine the file's current content before attempting a text replacement.

Expectation for parameters:
1. \`file_path\` MUST be an absolute path; otherwise an error will be thrown.
2. \`old_string\` MUST be the exact literal text to replace (including all whitespace, indentation, newlines, and surrounding code etc.).
3. \`new_string\` MUST be the exact literal text to replace \`old_string\` with (also including all whitespace, indentation, newlines, and surrounding code etc.). Ensure the resulting code is correct and idiomatic.
4. NEVER escape \`old_string\` or \`new_string\`, that would break the exact literal text requirement.
**Important:** If ANY of the above are not satisfied, the tool will fail. CRITICAL for \`old_string\`: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations, or does not match exactly, the tool will fail.`,
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to modify. Must start with '/'.",
            type: 'string',
          },
          old_string: {
            description:
              'The exact literal text to replace, preferably unescaped. CRITICAL: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string is not the exact literal text (i.e. you escaped it), matches multiple locations, or does not match exactly, the tool will fail.',
            type: 'string',
          },
          new_string: {
            description:
              'The exact literal text to replace `old_string` with, preferably unescaped. Provide the EXACT text. Ensure the resulting code is correct and idiomatic.',
            type: 'string',
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
        type: 'object',
      },
    );
    this.config = config;
    this.rootDirectory = path.resolve(this.config.getTargetDir());
    this.client = new GeminiClient(this.config);
  }

  /**
   * Checks if a path is within the root directory.
   * @param pathToCheck The absolute path to check.
   * @returns True if the path is within the root directory, false otherwise.
   */
  private isWithinRoot(pathToCheck: string): boolean {
    const normalizedPath = path.normalize(pathToCheck);
    const normalizedRoot = this.rootDirectory;
    const rootWithSep = normalizedRoot.endsWith(path.sep)
      ? normalizedRoot
      : normalizedRoot + path.sep;
    return (
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(rootWithSep)
    );
  }

  /**
   * Validates the parameters for the Edit tool
   * @param params Parameters to validate
   * @returns Error message string or null if valid
   */
  validateParams(params: EditToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }

    if (!path.isAbsolute(params.file_path)) {
      return `File path must be absolute: ${params.file_path}`;
    }

    if (!this.isWithinRoot(params.file_path)) {
      return `File path must be within the root directory (${this.rootDirectory}): ${params.file_path}`;
    }

    return null;
  }

  private _applyReplacement(
    currentContent: string | null,
    oldString: string,
    newString: string,
    isNewFile: boolean,
  ): string {
    if (isNewFile) {
      return newString;
    }
    if (currentContent === null) {
      // Should not happen if not a new file, but defensively return empty or newString if oldString is also empty
      return oldString === '' ? newString : '';
    }
    // If oldString is empty and it's not a new file, do not modify the content.
    if (oldString === '' && !isNewFile) {
      return currentContent;
    }
    return currentContent.replaceAll(oldString, newString);
  }

  /**
   * Calculates the potential outcome of an edit operation.
   * @param params Parameters for the edit operation
   * @returns An object describing the potential edit outcome
   * @throws File system errors if reading the file fails unexpectedly (e.g., permissions)
   */
  private async calculateEdit(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<CalculatedEdit> {
    const expectedReplacements = 1;
    let currentContent: string | null = null;
    let fileExists = false;
    let isNewFile = false;
    let finalNewString = params.new_string;
    let finalOldString = params.old_string;
    let occurrences = 0;
    let error: { display: string; raw: string } | undefined = undefined;

    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
      fileExists = true;
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        // Rethrow unexpected FS errors (permissions, etc.)
        throw err;
      }
      fileExists = false;
    }

    if (params.old_string === '' && !fileExists) {
      // Creating a new file
      isNewFile = true;
    } else if (!fileExists) {
      // Trying to edit a non-existent file (and old_string is not empty)
      error = {
        display: `File not found. Cannot apply edit. Use an empty old_string to create a new file.`,
        raw: `File not found: ${params.file_path}`,
      };
    } else if (currentContent !== null) {
      // Editing an existing file
      const correctedEdit = await ensureCorrectEdit(
        currentContent,
        params,
        this.client,
        abortSignal,
      );
      finalOldString = correctedEdit.params.old_string;
      finalNewString = correctedEdit.params.new_string;
      occurrences = correctedEdit.occurrences;

      if (params.old_string === '') {
        // Error: Trying to create a file that already exists
        error = {
          display: `Failed to edit. Attempted to create a file that already exists.`,
          raw: `File already exists, cannot create: ${params.file_path}`,
        };
      } else if (occurrences === 0) {
        error = {
          display: `Failed to edit, could not find the string to replace.`,
          raw: `Failed to edit, 0 occurrences found for old_string in ${params.file_path}. No edits made. The exact text in old_string was not found. Ensure you're not escaping content incorrectly and check whitespace, indentation, and context. Use ${ReadFileTool.Name} tool to verify.`,
        };
      } else if (occurrences !== expectedReplacements) {
        error = {
          display: `Failed to edit, expected ${expectedReplacements} occurrence(s) but found ${occurrences}.`,
          raw: `Failed to edit, Expected ${expectedReplacements} occurrences but found ${occurrences} for old_string in file: ${params.file_path}`,
        };
      }
    } else {
      // Should not happen if fileExists and no exception was thrown, but defensively:
      error = {
        display: `Failed to read content of file.`,
        raw: `Failed to read content of existing file: ${params.file_path}`,
      };
    }

    const newContent = this._applyReplacement(
      currentContent,
      finalOldString,
      finalNewString,
      isNewFile,
    );

    return {
      currentContent,
      newContent,
      occurrences,
      error,
      isNewFile,
    };
  }

  /**
   * Handles the confirmation prompt for the Edit tool in the CLI.
   * It needs to calculate the diff to show the user.
   */
  async shouldConfirmExecute(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getAlwaysSkipModificationConfirmation()) {
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
    let finalNewString = params.new_string;
    let finalOldString = params.old_string;
    let occurrences = 0;

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
      // Creating new file, newContent is just params.new_string
    } else if (!fileExists) {
      return false; // Cannot edit non-existent file if old_string is not empty
    } else if (currentContent !== null) {
      const correctedEdit = await ensureCorrectEdit(
        currentContent,
        params,
        this.client,
        abortSignal,
      );
      finalOldString = correctedEdit.params.old_string;
      finalNewString = correctedEdit.params.new_string;
      occurrences = correctedEdit.occurrences;

      if (occurrences === 0 || occurrences !== 1) {
        return false;
      }
    } else {
      return false; // Should not happen
    }

    const isNewFileScenario = params.old_string === '' && !fileExists;
    const newContent = this._applyReplacement(
      currentContent,
      finalOldString,
      finalNewString,
      isNewFileScenario,
    );

    const fileName = path.basename(params.file_path);
    const fileDiff = Diff.createPatch(
      fileName,
      currentContent ?? '',
      newContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );
    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Edit: ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`,
      fileName,
      fileDiff,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setAlwaysSkipModificationConfirmation(true);
        }
      },
    };
    return confirmationDetails;
  }

  getDescription(params: EditToolParams): string {
    const relativePath = makeRelative(params.file_path, this.rootDirectory);
    if (params.old_string === '') {
      return `Create ${shortenPath(relativePath)}`;
    }
    const oldStringSnippet =
      params.old_string.split('\n')[0].substring(0, 30) +
      (params.old_string.length > 30 ? '...' : '');
    const newStringSnippet =
      params.new_string.split('\n')[0].substring(0, 30) +
      (params.new_string.length > 30 ? '...' : '');
    return `${shortenPath(relativePath)}: ${oldStringSnippet} => ${newStringSnippet}`;
  }

  /**
   * Executes the edit operation with the given parameters.
   * @param params Parameters for the edit operation
   * @returns Result of the edit operation
   */
  async execute(
    params: EditToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params, _signal);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error preparing edit: ${errorMsg}`,
        returnDisplay: `Error preparing edit: ${errorMsg}`,
      };
    }

    if (editData.error) {
      return {
        llmContent: editData.error.raw,
        returnDisplay: `Error: ${editData.error.display}`,
      };
    }

    try {
      this.ensureParentDirectoriesExist(params.file_path);
      fs.writeFileSync(params.file_path, editData.newContent, 'utf8');

      let displayResult: ToolResultDisplay;
      if (editData.isNewFile) {
        displayResult = `Created ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`;
      } else {
        // Generate diff for display, even though core logic doesn't technically need it
        // The CLI wrapper will use this part of the ToolResult
        const fileName = path.basename(params.file_path);
        const fileDiff = Diff.createPatch(
          fileName,
          editData.currentContent ?? '', // Should not be null here if not isNewFile
          editData.newContent,
          'Current',
          'Proposed',
          DEFAULT_DIFF_OPTIONS,
        );
        displayResult = { fileDiff, fileName };
      }

      const llmSuccessMessage = editData.isNewFile
        ? `Created new file: ${params.file_path} with provided content.`
        : `Successfully modified file: ${params.file_path} (${editData.occurrences} replacements).`;

      return {
        llmContent: llmSuccessMessage,
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error executing edit: ${errorMsg}`,
        returnDisplay: `Error writing file: ${errorMsg}`,
      };
    }
  }

  /**
   * Creates parent directories if they don't exist
   */
  private ensureParentDirectoriesExist(filePath: string): void {
    const dirName = path.dirname(filePath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
  }
}
