/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as Diff from 'diff';
import {
  BaseTool,
  Icon,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
  ToolLocation,
  ToolResult,
  ToolResultDisplay,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';

export interface UdiffEditorParams {
  file_path: string;
  udiff_content: string;
  modified_by_user?: boolean;
}

interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  error?: { display: string; raw: string; type: ToolErrorType };
}

export class UdiffEditor extends BaseTool<UdiffEditorParams, ToolResult> {
  static readonly Name = 'udiff_editor';

  constructor(private readonly config: Config) {
    super(
      UdiffEditor.Name,
      'Udiff Editor',
      `Applies a unified diff patch to a single, **existing** file.

This tool is designed to be flexible. It will first attempt a standard patch application. If that fails, it will fall back to a more lenient search-and-replace strategy based on the diff content. This helps correct for common LLM errors like omitting comments or blank lines from the diff.

**CRITICAL:**
- This tool CANNOT create new files. Use \`write_file\` for that purpose.
- **Always read the file content immediately before using this tool** to ensure the diff is not stale.

**Best Practices:**
- Provide diffs for complete, logical blocks (like entire functions or classes) rather than small, surgical line changes. This increases the chance of a successful match.
- If a patch fails, re-read the file, generate a new diff, and try again.`,
      Icon.Pencil,
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to modify. Must start with '/'.",
            type: Type.STRING,
          },
          udiff_content: {
            description:
              'The unified diff content to apply to the file. The tool will intelligently try to apply this, even if it has minor imperfections.',
            type: Type.STRING,
          },
        },
        required: ['file_path', 'udiff_content'],
        type: Type.OBJECT,
      },
    );
  }

  validateToolParams(params: UdiffEditorParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (!path.isAbsolute(params.file_path)) {
      return `File path must be absolute: ${params.file_path}`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(params.file_path)) {
      const directories = workspaceContext.getDirectories();
      return `File path must be within one of the workspace directories: ${directories.join(', ')}`;
    }

    return null;
  }

  toolLocations(params: UdiffEditorParams): ToolLocation[] {
    return [{ path: params.file_path }];
  }

  // NEW: Helper to parse a hunk into search/replace blocks.
  /**
   * Parses a single diff hunk into an "original" block to search for and a
   * "new" block to replace it with. This ignores line numbers and focuses
   * only on the content, making it flexible.
   * @param hunk The hunk object from the 'diff' library.
   * @returns An object with original and new string blocks.
   */
  private parseHunkToSearchAndReplace(hunk: Diff.Hunk): {
    original: string;
    updated: string;
  } {
    const originalLines: string[] = [];
    const updatedLines: string[] = [];

    for (const line of hunk.lines) {
      const content = line.substring(1);
      if (line.startsWith('-')) {
        originalLines.push(content);
      } else if (line.startsWith('+')) {
        updatedLines.push(content);
      } else if (line.startsWith(' ')) {
        originalLines.push(content);
        updatedLines.push(content);
      }
      // Ignore lines like '\ No newline at end of file'
    }

    return {
      original: originalLines.join('\n'),
      updated: updatedLines.join('\n'),
    };
  }

  // NEW: Flexible patch application logic.
  /**
   * Applies a single patch with multiple strategies, from strictest to most lenient.
   * @param content The current content to be patched.
   * @param patch A single parsed patch containing hunks.
   * @returns The patched content as a string, or `false` if all strategies fail.
   */
  private applyPatchFlexibly(
    content: string,
    patch: Diff.ParsedDiff,
  ): string | false {
    // Strategy 1: Standard 'diff' library application with fuzz factor.
    const strictResult = Diff.applyPatch(content, patch, { fuzzFactor: 2 });
    if (strictResult !== false) {
      return strictResult;
    }

    // Strategy 2: Fallback to search-and-replace for each hunk.
    // This is effective when the LLM forgets context lines (comments, etc.).
    if (patch.hunks.length === 1) {
      const hunk = patch.hunks[0];
      const { original, updated } = this.parseHunkToSearchAndReplace(hunk);

      // Ensure the original block is not empty and exists in the content
      if (original && content.includes(original)) {
        return content.replace(original, updated);
      }
    }

    // All strategies failed.
    return false;
  }

  private async calculateEdit(
    params: UdiffEditorParams,
  ): Promise<CalculatedEdit> {
    let currentContent: string | null = null;
    let fileExists = false;

    try {
      currentContent = await fs.readFile(params.file_path, 'utf8');
      fileExists = true;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        fileExists = false;
        currentContent = '';
      } else {
        throw err;
      }
    }

    if (!fileExists) {
      return {
        currentContent,
        newContent: '',
        error: {
          display: `File not found: ${params.file_path}. This tool cannot create new files.`,
          raw: `File not found: ${params.file_path}`,
          type: ToolErrorType.FILE_NOT_FOUND,
        },
      };
    }

    let udiffContent = params.udiff_content;
    if (!udiffContent.endsWith('\n')) {
      udiffContent += '\n';
    }

    const patches = Diff.parsePatch(udiffContent);
    if (!patches || patches.length === 0) {
      return {
        currentContent,
        newContent: '',
        error: {
          display: `The provided udiff is invalid or empty.`,
          raw: `The provided udiff is invalid or empty for file: ${params.file_path}`,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    let cumulativeContent: string = currentContent;
    for (const [index, patch] of patches.entries()) {
      // The diff library often creates patches with empty hunks for file-level headers. Skip them.
      if (patch.hunks.length === 0) continue;

      const result = this.applyPatchFlexibly(cumulativeContent, patch);

      if (result === false) {
        return {
          currentContent,
          newContent: '',
          error: {
            display: `Failed to apply the patch. The content to be changed in hunk #${index + 1} was not found in the file.`,
            raw: `The udiff could not be applied to ${params.file_path}. Failed at hunk #${index + 1}. The content might be stale or the diff malformed.`,
            type: ToolErrorType.EDIT_NO_OCCURRENCE_FOUND,
          },
        };
      }
      cumulativeContent = result;
    }

    return {
      currentContent,
      newContent: cumulativeContent,
    };
  }

  // Unchanged methods below...
  async shouldConfirmExecute(
    params: UdiffEditorParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }
    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(
        `[UdiffEditor] Attempted confirmation with invalid parameters: ${validationError}`,
      );
      return false;
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`Error preparing edit: ${errorMsg}`);
      return false;
    }

    if (editData.error) {
      console.log(`Error: ${editData.error.display}`);
      return false;
    }

    const fileName = path.basename(params.file_path);
    const fileDiff = Diff.createPatch(
      fileName,
      editData.currentContent ?? '',
      editData.newContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );
    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Edit: ${shortenPath(makeRelative(params.file_path, this.config.getTargetDir()))}`,
      fileName,
      fileDiff,
      originalContent: editData.currentContent,
      newContent: editData.newContent,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  getDescription(params: UdiffEditorParams): string {
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    return `Apply udiff to ${shortenPath(relativePath)}`;
  }

  async execute(
    params: UdiffEditorParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
        error: {
          message: validationError,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error preparing edit: ${errorMsg}`,
        returnDisplay: `Error preparing edit: ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.EDIT_PREPARATION_FAILURE,
        },
      };
    }

    if (editData.error) {
      return {
        llmContent: editData.error.raw,
        returnDisplay: `Error: ${editData.error.display}`,
        error: {
          message: editData.error.raw,
          type: editData.error.type,
        },
      };
    }

    try {
      await fs.writeFile(params.file_path, editData.newContent, 'utf8');

      const fileName = path.basename(params.file_path);
      const fileDiff = Diff.createPatch(
        fileName,
        editData.currentContent ?? '',
        editData.newContent,
        'Current',
        'Proposed',
        DEFAULT_DIFF_OPTIONS,
      );
      const displayResult: ToolResultDisplay = {
        fileDiff,
        fileName,
        originalContent: editData.currentContent,
        newContent: editData.newContent,
      };

      const llmSuccessMessageParts = [
        `Successfully modified file: ${params.file_path} by applying the udiff.`,
      ];
      if (params.modified_by_user) {
        llmSuccessMessageParts.push(`User modified the udiff.`);
      }

      return {
        llmContent: llmSuccessMessageParts.join(' '),
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error executing edit: ${errorMsg}`,
        returnDisplay: `Error writing file: ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.FILE_WRITE_FAILURE,
        },
      };
    }
  }
}
