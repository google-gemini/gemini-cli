/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';
import * as path from 'node:path';
import type {
  ToolCallConfirmationDetails,
  ToolEditConfirmationDetails,
  ToolInvocation,
  ToolLocation,
  ToolResult,
} from './tools.js';
import { BaseDeclarativeTool, Kind, ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import {
  parse,
  applyHunksToContent,
  applyPatchesToFS,
  isFileDeletionHunk,
} from '../utils/patcher.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import type { Hunk, PatchError } from '../utils/patcher.js';

/**
 * Parameters for the Patch tool
 */
export interface PatchToolParams {
  /**
   * A complete, multi-file patch in the standard unified diff format.
   */
  unified_diff: string;

  /**
   * Initially proposed content by the user.
   */
  ai_proposed_content?: string;
}

/**
 * Data structure to hold the results of the dry-run.
 */
interface CalculatedPatch {
  // Map from filepath to its original content and the new content after applying only successful hunks.
  fileDiffInfo: Map<string, { originalContent: string; newContent: string }>;
  // A map of filepaths to just the hunks that were successful in the dry-run.
  successfulHunks: Map<string, Hunk[]>;
  // A map of filepaths to hunks that failed the dry-run, including the error.
  // A map of filepaths to hunks that failed the dry-run, including the error.
  failedHunks: Map<string, Array<{ hunk: Hunk; error: PatchError }>>;
  // For fatal errors like parsing failure.
  error?: { display: string; raw: string; type: ToolErrorType };
  // The total number of files identified in the original patch.
  totalFiles: number;
}

/**
 * Formats a map of failed hunks back into a unified diff string for the LLM.
 */
function formatFailedHunksToDiff(
  failedHunks: Map<string, Array<{ hunk: Hunk; error: PatchError }>>,
): string {
  let diffString = '';
  for (const [filepath, failures] of failedHunks.entries()) {
    diffString += `--- a/${filepath}\n`;
    diffString += `+++ b/${filepath}\n`;
    for (const { hunk } of failures) {
      diffString += `${hunk.originalHunk}\n`;
    }
  }
  return diffString.trim();
}

class PatchToolInvocation
  implements ToolInvocation<PatchToolParams, ToolResult>
{
  private calculatedPatchPromise?: Promise<CalculatedPatch>;

  constructor(
    private readonly config: Config,
    public params: PatchToolParams,
  ) {}

  toolLocations(): ToolLocation[] {
    try {
      const fileHunks = parse(this.params.unified_diff);
      return Array.from(fileHunks.keys()).map((path) => ({ path }));
    } catch (_e) {
      return [];
    }
  }

  /**
   * Performs a dry-run of the patch to validate it, separating successful
   * hunks from failed ones and generating a diff for the successful changes.
   */
  private async _calculatePatch(): Promise<CalculatedPatch> {
    let parsedHunks: Map<string, Hunk[]>;
    try {
      parsedHunks = parse(this.params.unified_diff);
      if (parsedHunks.size === 0) {
        return {
          fileDiffInfo: new Map(),
          successfulHunks: new Map(),
          failedHunks: new Map(),
          totalFiles: 0,
          error: {
            display: 'The provided diff was empty or invalid.',
            raw: 'Patch failed: The unified_diff parameter did not contain any valid hunks.',
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
        };
      }
    } catch (e: unknown) {
      return {
        fileDiffInfo: new Map(),
        successfulHunks: new Map(),
        failedHunks: new Map(),
        totalFiles: 0,
        error: {
          display: `Failed to parse the diff: ${(e as Error).message}`,
          raw: `Patch failed during parsing: ${(e as Error).message}`,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    const totalFiles = parsedHunks.size;
    const fileDiffInfo = new Map<
      string,
      { originalContent: string; newContent: string }
    >();
    const successfulHunks = new Map<string, Hunk[]>();
    const failedHunks = new Map<
      string,
      Array<{ hunk: Hunk; error: PatchError }>
    >();

    for (const [filepath, hunks] of parsedHunks.entries()) {
      // Handle file deletion as a special case first.
      if (hunks.length > 0 && isFileDeletionHunk(hunks[0])) {
        try {
          const absolutePath = path.join(this.config.getTargetDir(), filepath);
          const originalContent = await this.config
            .getFileSystemService()
            .readTextFile(absolutePath);
          // If successful, mark for deletion and show diff.
          successfulHunks.set(filepath, hunks);
          fileDiffInfo.set(filepath, {
            originalContent: originalContent.replace(/\r\n/g, '\n'),
            newContent: '',
          });
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            // File doesn't exist, so deletion is a silent success (no-op).
            successfulHunks.set(filepath, hunks);
            fileDiffInfo.set(filepath, {
              originalContent: '',
              newContent: '',
            });
          } else {
            failedHunks.set(filepath, [
              { hunk: hunks[0], error: err as PatchError },
            ]);
          }
        }
        continue; // Move to the next file.
      }

      let originalContent = '';
      try {
        const absolutePath = path.join(this.config.getTargetDir(), filepath);
        originalContent = await this.config
          .getFileSystemService()
          .readTextFile(absolutePath);
        originalContent = originalContent.replace(/\r\n/g, '\n');
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }

      const { newContent, failedHunks: dryRunFailures } = applyHunksToContent(
        originalContent,
        hunks,
      );

      if (dryRunFailures.length > 0) {
        failedHunks.set(filepath, dryRunFailures);
      }

      const success = hunks.filter(
        (h) =>
          !dryRunFailures.some((f) => f.hunk.originalHunk === h.originalHunk),
      );

      if (success.length > 0) {
        successfulHunks.set(filepath, success);
        fileDiffInfo.set(filepath, { originalContent, newContent });
      }
    }

    return { fileDiffInfo, successfulHunks, failedHunks, totalFiles };
  }

  private calculatePatch(): Promise<CalculatedPatch> {
    if (!this.calculatedPatchPromise) {
      this.calculatedPatchPromise = this._calculatePatch();
    }
    return this.calculatedPatchPromise;
  }

  async shouldConfirmExecute(): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.YOLO) {
      return false;
    }

    const patchData = await this.calculatePatch();

    if (patchData.error) {
      console.log(`Error: ${patchData.error.display}`);
      return false;
    }

    if (patchData.successfulHunks.size === 0) {
      const firstError = Array.from(patchData.failedHunks.values())[0]?.[0]
        ?.error.message;
      console.log(
        `Error: No changes could be applied from the patch. First error: ${firstError || 'Unknown error'}`,
      );
      return false;
    }

    let combinedDiff = '';
    for (const [filepath, contents] of patchData.fileDiffInfo.entries()) {
      const fileDiff = Diff.createPatch(
        filepath,
        contents.originalContent,
        contents.newContent,
        'Current',
        'Proposed',
        DEFAULT_DIFF_OPTIONS,
      );
      combinedDiff += fileDiff + '\n';
    }

    const firstFilePath = Array.from(patchData.fileDiffInfo.keys())[0];
    const isPartial = patchData.failedHunks.size > 0;
    const numFiles = patchData.successfulHunks.size;

    const title = isPartial
      ? `Confirm Partial Patch (${numFiles} file(s), some changes failed)`
      : `Confirm Patch Application (${numFiles} file(s))`;

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title,
      fileName: `${numFiles} file(s) will be changed`,
      filePath: firstFilePath,
      fileDiff: combinedDiff.trim(),
      originalContent: null,
      newContent: '',
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.YOLO);
        }
      },
      ideConfirmation:
        numFiles === 1
          ? this.config
              .getIdeClient()
              ?.openDiff(
                firstFilePath,
                patchData.fileDiffInfo.get(firstFilePath)!.newContent,
              )
          : undefined,
    };
    return confirmationDetails;
  }

  getDescription(): string {
    try {
      const fileHunks = parse(this.params.unified_diff);
      const filePaths = Array.from(fileHunks.keys()).map((p) =>
        shortenPath(makeRelative(p, this.config.getTargetDir())),
      );
      if (filePaths.length === 0) return 'Apply an empty patch';
      if (filePaths.length === 1) return `Apply patch to ${filePaths[0]}`;
      return `Apply patch to ${filePaths.length} files: ${filePaths
        .slice(0, 2)
        .join(', ')}...`;
    } catch {
      return 'Apply an invalid patch';
    }
  }

  async execute(): Promise<ToolResult> {
    const patchData = await this.calculatePatch();

    if (patchData.error) {
      return {
        llmContent: patchData.error.raw,
        returnDisplay: `Error: ${patchData.error.display}`,
        error: {
          message: patchData.error.raw,
          type: patchData.error.type,
        },
      };
    }

    if (patchData.successfulHunks.size === 0) {
      const failedHunksDiff = formatFailedHunksToDiff(patchData.failedHunks);
      const rawError = `Patch failed. No hunks could be applied. Please correct the following hunks:\n${failedHunksDiff}`;
      return {
        llmContent: rawError,
        returnDisplay: `Error: No changes could be applied from the patch.`,
        error: {
          message: rawError,
          type: ToolErrorType.EDIT_NO_OCCURRENCE_FOUND,
        },
      };
    }

    try {
      const report = await applyPatchesToFS(
        patchData.successfulHunks,
        this.config,
        patchData.totalFiles,
        this.config.getFileSystemService(),
      );

      let llmContent = `Successfully applied some changes.\n${report}`;
      let finalReport = report;
      if (patchData.failedHunks.size > 0) {
        const failedHunksDiff = formatFailedHunksToDiff(patchData.failedHunks);
        llmContent += `\n\nThe following hunks failed to apply and need to be corrected:\n${failedHunksDiff}`;

        for (const [filepath] of patchData.failedHunks.entries()) {
          if (!patchData.successfulHunks.has(filepath)) {
            finalReport += `\n\n❌ ALL HUNKS FAILED for ${filepath}`;
          }
        }
      }

      return {
        llmContent,
        returnDisplay: finalReport.trim(),
      };
    } catch (e: unknown) {
      return {
        llmContent: `Error executing patch: ${(e as Error).message}`,
        returnDisplay: `Error applying patch: ${(e as Error).message}`,
        error: {
          message: (e as Error).message,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

/**
 * Implementation of the Patch tool
 */
export class PatchTool extends BaseDeclarativeTool<
  PatchToolParams,
  ToolResult
> {
  static readonly Name = 'patch';
  constructor(private readonly config: Config) {
    super(
      PatchTool.Name,
      'Patch',
      'Applies a multi-file code change using the standard unified diff format. This tool is the preferred method for any multi-line or multi-file change, as it is more robust and efficient than using `replace`. It aligns with the LLM`s strength of generating diffs. The diff must be complete and well-formed. This tool can create, delete, and modify multiple files in a single operation. The line number hints are totally ignored when applying hunks, rely purely on context based match, so please pay attention to give reliable hunk context',
      Kind.Edit,
      {
        properties: {
          unified_diff: {
            description:
              'A string containing the full patch in the standard unified diff format.',
            type: 'string',
          },
        },
        required: ['unified_diff'],
        type: 'object',
      },
    );
  }

  protected createInvocation(
    params: PatchToolParams,
  ): ToolInvocation<PatchToolParams, ToolResult> {
    return new PatchToolInvocation(this.config, params);
  }
}
