/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
import { GeminiClient } from '../core/client.js';
import { Config, ApprovalMode } from '../config/config.js';
import { ensureCorrectEdit } from '../utils/editCorrector.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { openDiff } from '../utils/editor.js';
import { ReadFileTool } from './read-file.js';

/**
 * Parameters for the Edit tool
 */
export interface EditToolParams {
  /**
   * The absolute path to the file to modify
   */
  file_path: string;

  /**
   * Array of edits to apply
   */
  edits: Array<{
    old_string: string;
    new_string: string;
  }>;

  /**
   * Number of replacements expected. Defaults to 1 if not specified.
   * Use when you want to replace multiple occurrences.
   */
  expected_replacements?: number;
}

interface EditResult extends ToolResult {
  editsApplied: number;
  editsAttempted: number;
  editsFailed: number;
  failedEdits?: Array<{
    index: number;
    oldString: string;
    newString: string;
    error: string;
  }>;
}

interface FailedEdit {
  index: number;
  oldString: string;
  newString: string;
  error: string;
}

/**
 * Implementation of the Edit tool logic
 */
export class EditTool extends BaseTool<EditToolParams, EditResult> {
  static readonly Name = 'replace';
  private readonly config: Config;
  private readonly rootDirectory: string;
  private readonly client: GeminiClient;
  private tempOldDiffPath?: string;
  private tempNewDiffPath?: string;

  /**
   * Creates a new instance of the EditLogic
   * @param rootDirectory Root directory to ground this tool in.
   */
  constructor(config: Config) {
    super(
      EditTool.Name,
      'EditFile',
      `Replaces text within a file. By default, replaces a single occurrence, but can replace multiple occurrences when \`expected_replacements\` is specified. This tool also supports batch editing with multiple edits in a single operation. Requires providing significant context around the change to ensure precise targeting. Always use the ${ReadFileTool.Name} tool to examine the file's current content before attempting a text replacement.

Expectation for required parameters:
1. \`file_path\` MUST be an absolute path; otherwise an error will be thrown.
2. \`old_string\` MUST be the exact literal text to replace (including all whitespace, indentation, newlines, and surrounding code etc.).
3. \`new_string\` MUST be the exact literal text to replace \`old_string\` with (also including all whitespace, indentation, newlines, and surrounding code etc.). Ensure the resulting code is correct and idiomatic.
4. NEVER escape \`old_string\` or \`new_string\`, that would break the exact literal text requirement.
**Important:** If ANY of the above are not satisfied, the tool will fail. CRITICAL for \`old_string\`: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations, or does not match exactly, the tool will fail.
**Multiple replacements:** Set \`expected_replacements\` to the number of occurrences you want to replace. The tool will replace ALL occurrences that match \`old_string\` exactly. Ensure the number of replacements matches your expectation.`,
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to modify. Must start with '/'.",
            type: 'string',
          },
          edits: {
            description:
              'Array of edit operations to apply. Each edit should have old_string and new_string properties.',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                old_string: {
                  description:
                    'The exact literal text to replace, preferably unescaped. CRITICAL: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely.',
                  type: 'string',
                },
                new_string: {
                  description:
                    'The exact literal text to replace old_string with, preferably unescaped. Provide the EXACT text. Ensure the resulting code is correct and idiomatic.',
                  type: 'string',
                },
              },
              required: ['old_string', 'new_string'],
            },
          },
          expected_replacements: {
            type: 'number',
            description:
              'Number of replacements expected. Defaults to 1 if not specified. Use when you want to replace multiple occurrences.',
            minimum: 1,
          },
        },
        required: ['file_path', 'edits'],
        type: 'object',
      },
    );
    this.config = config;
    this.rootDirectory = path.resolve(this.config.getTargetDir());
    this.client = config.getGeminiClient();
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
  validateToolParams(params: EditToolParams): string | null {
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

    // Validate that edits array is provided and not empty
    if (!params.edits || params.edits.length === 0) {
      return 'Must provide "edits" array with at least one edit.';
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
   * Applies multiple edits to file content in sequence
   * @param params Edit parameters
   * @param abortSignal Abort signal for cancellation
   * @returns Result with detailed edit metrics
   */
  private async applyMultipleEdits(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<{
    newContent: string;
    editsApplied: number;
    editsAttempted: number;
    editsFailed: number;
    failedEdits: FailedEdit[];
    isNewFile: boolean;
    originalContent: string | null;
  }> {
    // Read current file content or determine if this is a new file
    let currentContent: string | null = null;
    let fileExists = false;
    let isNewFile = false;

    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
      fileExists = true;
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        throw err;
      }
    }

    // If file doesn't exist and first edit has empty old_string, it's file creation
    if (!fileExists && params.edits[0].old_string === '') {
      isNewFile = true;
      currentContent = '';
    } else if (!fileExists) {
      throw new Error(`File does not exist: ${params.file_path}`);
    } else if (fileExists && params.edits[0].old_string === '') {
      // Protect against accidentally creating a file that already exists
      throw new Error(`File already exists: ${params.file_path}`);
    }

    const expectedReplacements = params.expected_replacements ?? 1;

    const result = {
      newContent: currentContent || '',
      editsApplied: 0,
      editsAttempted: params.edits.length,
      editsFailed: 0,
      failedEdits: [] as FailedEdit[],
      isNewFile,
      originalContent: currentContent,
    };

    // Apply each edit
    for (let i = 0; i < params.edits.length; i++) {
      const edit = params.edits[i];

      // Handle new file creation with empty old_string
      if (isNewFile && edit.old_string === '') {
        result.newContent = edit.new_string;
        result.editsApplied++;
        continue;
      }

      // Use edit corrector for better matching
      try {
        const correctedEdit = await ensureCorrectEdit(
          result.newContent,
          {
            ...params,
            old_string: edit.old_string,
            new_string: edit.new_string,
          },
          this.client,
          abortSignal,
        );

        // Handle both single and multiple replacements based on expected_replacements
        if (expectedReplacements === 1 && correctedEdit.occurrences === 1) {
          result.newContent = result.newContent.replace(
            correctedEdit.params.old_string,
            correctedEdit.params.new_string,
          );
          result.editsApplied++;
        } else if (
          expectedReplacements > 1 &&
          correctedEdit.occurrences === expectedReplacements
        ) {
          result.newContent = result.newContent.replaceAll(
            correctedEdit.params.old_string,
            correctedEdit.params.new_string,
          );
          result.editsApplied++;
        } else {
          result.editsFailed++;
          result.failedEdits.push({
            index: i,
            oldString: edit.old_string,
            newString: edit.new_string,
            error:
              correctedEdit.occurrences === 0
                ? 'String not found'
                : `Expected ${expectedReplacements} occurrences but found ${correctedEdit.occurrences}`,
          });
        }
      } catch (error) {
        result.editsFailed++;
        result.failedEdits.push({
          index: i,
          oldString: edit.old_string,
          newString: edit.new_string,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Handles the confirmation prompt for the Edit tool in the CLI.
   * It needs to calculate the diff to show the user.
   */
  async shouldConfirmExecute(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }
    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(
        `[EditTool Wrapper] Attempted confirmation with invalid parameters: ${validationError}`,
      );
      return false;
    }

    try {
      // Calculate what the edits would produce
      const editResult = await this.applyMultipleEdits(params, abortSignal);

      // Don't show confirmation if no edits would be applied
      if (editResult.editsApplied === 0 && !editResult.isNewFile) {
        return false;
      }

      // Read current content for diff comparison
      let currentContent: string | null = null;
      try {
        currentContent = fs.readFileSync(params.file_path, 'utf8');
      } catch (err: unknown) {
        if (isNodeError(err) && err.code === 'ENOENT') {
          currentContent = '';
        } else {
          console.error(`Error reading file for confirmation diff: ${err}`);
          return false;
        }
      }

      // Generate diff for confirmation
      const fileName = path.basename(params.file_path);
      const fileDiff = Diff.createPatch(
        fileName,
        currentContent || '',
        editResult.newContent,
        'Current',
        'Proposed',
        DEFAULT_DIFF_OPTIONS,
      );

      const editsCount = params.edits.length;
      const title =
        editsCount > 1
          ? `Confirm ${editsCount} Edits: ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`
          : `Confirm Edit: ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`;

      const confirmationDetails: ToolEditConfirmationDetails = {
        type: 'edit',
        title,
        fileName,
        fileDiff,
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          if (outcome === ToolConfirmationOutcome.ProceedAlways) {
            this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
          }
        },
      };
      return confirmationDetails;
    } catch (error) {
      console.error(`Error generating confirmation diff: ${error}`);
      return false;
    }
  }

  getDescription(params: EditToolParams): string {
    if (!params.file_path) {
      return `Model did not provide valid parameters for edit tool`;
    }
    const relativePath = makeRelative(params.file_path, this.rootDirectory);

    if (!params.edits || params.edits.length === 0) {
      return `Edit ${shortenPath(relativePath)}`;
    }

    if (params.edits.length === 1) {
      const edit = params.edits[0];
      if (edit.old_string === '') {
        return `Create ${shortenPath(relativePath)}`;
      }
      const oldSnippet =
        edit.old_string.split('\n')[0].substring(0, 30) +
        (edit.old_string.length > 30 ? '...' : '');
      const newSnippet =
        edit.new_string.split('\n')[0].substring(0, 30) +
        (edit.new_string.length > 30 ? '...' : '');
      return `${shortenPath(relativePath)}: ${oldSnippet} => ${newSnippet}`;
    } else {
      return `Edit ${shortenPath(relativePath)} (${params.edits.length} edits)`;
    }
  }

  /**
   * Executes the edit operation with the given parameters.
   * @param params Parameters for the edit operation
   * @returns Result of the edit operation
   */
  async execute(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<EditResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
        editsApplied: 0,
        editsAttempted: 0,
        editsFailed: 1,
      };
    }

    try {
      const editResult = await this.applyMultipleEdits(params, abortSignal);

      // Apply the changes to the file
      this.ensureParentDirectoriesExist(params.file_path);
      fs.writeFileSync(params.file_path, editResult.newContent, 'utf8');

      // Generate appropriate response messages
      let displayResult: ToolResultDisplay;
      let llmContent: string;

      if (editResult.isNewFile) {
        displayResult = `Created ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`;
        llmContent = `Created new file: ${params.file_path}`;
      } else if (editResult.editsApplied > 0) {
        // Generate diff for display using original content before writing
        const fileName = path.basename(params.file_path);
        // Use the original content from before the edit was applied
        const originalContent = editResult.originalContent || '';
        const fileDiff = Diff.createPatch(
          fileName,
          originalContent,
          editResult.newContent,
          'Current',
          'Proposed',
          DEFAULT_DIFF_OPTIONS,
        );
        displayResult = { fileDiff, fileName };
        llmContent = `Successfully applied ${editResult.editsApplied}/${editResult.editsAttempted} edits to ${params.file_path}`;
      } else {
        displayResult = `No edits applied to ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`;
        llmContent = `Failed to apply any edits to ${params.file_path}`;
      }

      // Add details about failed edits
      if (editResult.editsFailed > 0) {
        const failureDetails = editResult.failedEdits
          .map((f) => `Edit ${f.index + 1}: ${f.error}`)
          .join('; ');
        llmContent += `. Failed edits: ${failureDetails}`;
      }

      return {
        llmContent,
        returnDisplay: displayResult,
        editsApplied: editResult.editsApplied,
        editsAttempted: editResult.editsAttempted,
        editsFailed: editResult.editsFailed,
        failedEdits: editResult.failedEdits,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const editsAttempted = params.edits.length;

      return {
        llmContent: `Error executing edits: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
        editsApplied: 0,
        editsAttempted,
        editsFailed: editsAttempted,
      };
    }
  }

  /**
   * Creates temp files for the current and proposed file contents and opens a diff tool.
   * When the diff tool is closed, the tool will check if the file has been modified and provide the updated params.
   * @returns Updated params and diff if the file has been modified, undefined otherwise.
   */
  async onModify(
    params: EditToolParams,
    _abortSignal: AbortSignal,
    outcome: ToolConfirmationOutcome,
  ): Promise<
    { updatedParams: EditToolParams; updatedDiff: string } | undefined
  > {
    const { oldPath, newPath } = this.createTempFiles(params);
    this.tempOldDiffPath = oldPath;
    this.tempNewDiffPath = newPath;

    await openDiff(
      this.tempOldDiffPath,
      this.tempNewDiffPath,
      outcome === ToolConfirmationOutcome.ModifyVSCode ? 'vscode' : 'vim',
    );
    return await this.getUpdatedParamsIfModified(params, _abortSignal);
  }

  private async getUpdatedParamsIfModified(
    params: EditToolParams,
    _abortSignal: AbortSignal,
  ): Promise<
    { updatedParams: EditToolParams; updatedDiff: string } | undefined
  > {
    if (!this.tempOldDiffPath || !this.tempNewDiffPath) return undefined;
    let oldContent = '';
    let newContent = '';
    try {
      oldContent = fs.readFileSync(this.tempOldDiffPath, 'utf8');
    } catch (err) {
      if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
      oldContent = '';
    }
    try {
      newContent = fs.readFileSync(this.tempNewDiffPath, 'utf8');
    } catch (err) {
      if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
      newContent = '';
    }

    // Combine the edits into a single edit
    const updatedParams: EditToolParams = {
      ...params,
      edits: [
        {
          old_string: oldContent,
          new_string: newContent,
        },
      ],
    };

    const updatedDiff = Diff.createPatch(
      path.basename(params.file_path),
      oldContent,
      newContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );

    this.deleteTempFiles();
    return { updatedParams, updatedDiff };
  }

  private createTempFiles(params: EditToolParams): Record<string, string> {
    this.deleteTempFiles();

    const tempDir = os.tmpdir();
    const diffDir = path.join(tempDir, 'gemini-cli-edit-tool-diffs');

    if (!fs.existsSync(diffDir)) {
      fs.mkdirSync(diffDir, { recursive: true });
    }

    const fileName = path.basename(params.file_path);
    const timestamp = Date.now();
    const tempOldPath = path.join(
      diffDir,
      `gemini-cli-edit-${fileName}-old-${timestamp}`,
    );
    const tempNewPath = path.join(
      diffDir,
      `gemini-cli-edit-${fileName}-new-${timestamp}`,
    );

    let currentContent = '';
    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
    } catch (err) {
      if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
      currentContent = '';
    }

    let proposedContent = currentContent;
    for (const edit of params.edits) {
      proposedContent = this._applyReplacement(
        proposedContent,
        edit.old_string,
        edit.new_string,
        edit.old_string === '' && currentContent === '',
      );
    }

    fs.writeFileSync(tempOldPath, currentContent, 'utf8');
    fs.writeFileSync(tempNewPath, proposedContent, 'utf8');
    return {
      oldPath: tempOldPath,
      newPath: tempNewPath,
    };
  }

  private deleteTempFiles(): void {
    try {
      if (this.tempOldDiffPath) {
        fs.unlinkSync(this.tempOldDiffPath);
        this.tempOldDiffPath = undefined;
      }
    } catch {
      console.error(`Error deleting temp diff file: `, this.tempOldDiffPath);
    }
    try {
      if (this.tempNewDiffPath) {
        fs.unlinkSync(this.tempNewDiffPath);
        this.tempNewDiffPath = undefined;
      }
    } catch {
      console.error(`Error deleting temp diff file: `, this.tempNewDiffPath);
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
