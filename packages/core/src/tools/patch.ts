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
import { IdeClient, IDEConnectionStatus } from '../ide/ide-client.js';
import { fixFailedHunk } from '../utils/patch-fixer.js';

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
  failedHunks: Map<string, Array<{ hunk: Hunk; error: PatchError }>>;
  // A map of filepaths to hunks that were skipped as no-ops.
  noOpHunks: Map<string, Hunk[]>;
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
  private async _calculatePatch(signal: AbortSignal): Promise<CalculatedPatch> {
    let parsedHunks: Map<string, Hunk[]>;
    try {
      parsedHunks = parse(this.params.unified_diff);
      if (parsedHunks.size === 0) {
        return {
          fileDiffInfo: new Map(),
          successfulHunks: new Map(),
          failedHunks: new Map(),
          noOpHunks: new Map(),
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
        noOpHunks: new Map(),
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
    const noOpHunks = new Map<string, Hunk[]>();

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

      const {
        newContent,
        failedHunks: firstPassFailures,
        noOpHunks: firstPassNoOps,
        appliedHunks: firstPassApplied,
      } = applyHunksToContent(originalContent, hunks);
      const finalFailedHunks: Array<{ hunk: Hunk; error: PatchError }> = [];
      const healedAndAppliedHunks: Hunk[] = [];
      let contentAfterHealing = newContent;

      if (firstPassFailures.length > 0) {
        for (const failure of firstPassFailures) {
          console.log(
            `Attempting to heal failed hunk for ${filepath}:`,
            failure.hunk.originalHunk,
          );
          try {
            const correctedPatchString = await fixFailedHunk(
              failure.hunk,
              filepath,
              contentAfterHealing, // Use the latest content for fixing
              this.config.getGeminiClient(),
              signal,
            );

            const newlyHealedHunks = parse(correctedPatchString).get(filepath);

            if (!newlyHealedHunks || newlyHealedHunks.length === 0) {
              throw new Error('LLM fixer returned an empty or invalid patch.');
            }

            // Try to apply the newly healed hunk immediately
            const { newContent: healedContent, failedHunks: healedFailures } =
              applyHunksToContent(contentAfterHealing, newlyHealedHunks);

            if (healedFailures.length > 0) {
              throw new Error('Healed hunk failed to apply.');
            }

            // Success! Update content and track the healed hunk.
            contentAfterHealing = healedContent;
            healedAndAppliedHunks.push(...newlyHealedHunks);
          } catch (_e) {
            finalFailedHunks.push(failure);
          }
        }
      }

      if (finalFailedHunks.length > 0) {
        failedHunks.set(filepath, finalFailedHunks);
      }

      if (firstPassNoOps.length > 0) {
        noOpHunks.set(filepath, firstPassNoOps);
      }

      const allSuccessfulHunks = [
        ...firstPassApplied,
        ...healedAndAppliedHunks,
        ...firstPassNoOps, // No-ops are also a form of success
      ];

      if (allSuccessfulHunks.length > 0) {
        successfulHunks.set(filepath, allSuccessfulHunks);
        fileDiffInfo.set(filepath, {
          originalContent,
          newContent: contentAfterHealing,
        });
      }
    }

    const changedFileDiffInfo = new Map<
      string,
      { originalContent: string; newContent: string }
    >();
    const changedSuccessfulHunks = new Map<string, Hunk[]>();

    for (const [filepath, diffInfo] of fileDiffInfo.entries()) {
      if (diffInfo.originalContent !== diffInfo.newContent) {
        changedFileDiffInfo.set(filepath, diffInfo);
        if (successfulHunks.has(filepath)) {
          changedSuccessfulHunks.set(filepath, successfulHunks.get(filepath)!);
        }
      }
    }

    return {
      fileDiffInfo: changedFileDiffInfo,
      successfulHunks: changedSuccessfulHunks,
      failedHunks,
      noOpHunks,
      totalFiles,
    };
  }

  private calculatePatch(signal: AbortSignal): Promise<CalculatedPatch> {
    if (!this.calculatedPatchPromise) {
      this.calculatedPatchPromise = this._calculatePatch(signal);
    }
    return this.calculatedPatchPromise;
  }

  async shouldConfirmExecute(
    signal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.YOLO) {
      return false;
    }

    const patchData = await this.calculatePatch(signal);

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
        path.basename(filepath),
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
    const firstFileContents = patchData.fileDiffInfo.get(firstFilePath);

    const title = isPartial
      ? `Confirm Partial Patch (${numFiles} file(s), some changes failed)`
      : `Confirm Patch Application (${numFiles} file(s))`;

    const ideClient = await IdeClient.getInstance();
    const ideConfirmation =
      numFiles === 1 &&
      this.config.getIdeMode() &&
      ideClient?.getConnectionStatus().status === IDEConnectionStatus.Connected
        ? ideClient.openDiff(
            firstFilePath,
            patchData.fileDiffInfo.get(firstFilePath)!.newContent,
          )
        : undefined;

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title,
      fileName:
        numFiles === 1
          ? path.basename(firstFilePath)
          : `${numFiles} file(s) will be changed`,
      filePath: firstFilePath,
      fileDiff: combinedDiff.trim(),
      originalContent:
        numFiles === 1 ? (firstFileContents?.originalContent ?? null) : null,
      newContent: numFiles === 1 ? (firstFileContents?.newContent ?? '') : '',
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.YOLO);
        }
      },
      ideConfirmation,
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

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const patchData = await this.calculatePatch(signal);

    if (patchData.error) {
      console.log(`Error: Failed to apply patch: ${patchData.error.display}`);
      return {
        llmContent: patchData.error.raw,
        returnDisplay: `Error: ${patchData.error.display}`,
        error: {
          message: patchData.error.raw,
          type: patchData.error.type,
        },
      };
    }

    // Display failed hunks for debugging
    if (patchData.failedHunks.size > 0) {
      for (const [filepath, failures] of patchData.failedHunks.entries()) {
        let originalContent =
          patchData.fileDiffInfo.get(filepath)?.originalContent;
        if (originalContent === undefined) {
          try {
            const absolutePath = path.join(
              this.config.getTargetDir(),
              filepath,
            );
            originalContent = await this.config
              .getFileSystemService()
              .readTextFile(absolutePath);
          } catch (readError) {
            originalContent = `[Content not available: Failed to re-read file during logging. Error: ${(readError as Error).message}]`;
          }
        }
        console.error('Original File Content:\n' + originalContent);
        console.error(
          'Failed Hunks:\n' +
            failures.map((f) => f.hunk.originalHunk).join('\n'),
        );
      }
    }

    if (patchData.successfulHunks.size === 0) {
      if (patchData.failedHunks.size > 0) {
        console.error('Error: No hunks could be applied from the patch.');
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
      } else {
        return {
          llmContent:
            'The patch was applied successfully. No changes were needed as the code already matched the patch.',
          returnDisplay: '✅ All changes from the patch are already present.',
        };
      }
    }

    try {
      const report = await applyPatchesToFS(
        patchData.successfulHunks,
        this.config,
        patchData.totalFiles,
        this.config.getFileSystemService(),
      );

      let llmContent = `Successfully applied some changes.\n${report}`;
      if (patchData.failedHunks.size > 0) {
        const failedHunksDiff = formatFailedHunksToDiff(patchData.failedHunks);
        console.log(`Warning: Some hunks failed to apply:\n${failedHunksDiff}`);
        llmContent += `\n\nThe following hunks failed to apply:\n${failedHunksDiff}`;
      }

      if (patchData.noOpHunks.size > 0) {
        let noOpMessage =
          '\n\nThe following hunks were skipped as no-ops (the changes were already present):';
        for (const [filepath, hunks] of patchData.noOpHunks.entries()) {
          noOpMessage += `\n- ${hunks.length} hunk(s) for ${filepath}`;
        }
        llmContent += noOpMessage;
      }

      return {
        llmContent,
        returnDisplay: report.trim(),
      };
    } catch (e: unknown) {
      console.log(`Error: Failed to execute patch: ${(e as Error).message}`);
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
      `Applies a code change to one or more files using the standard unified diff format.

**MANDATORY WORKFLOW:**
1. **ALWAYS** read the full, current content of the file(s) you intend to patch *immediately* before creating the \`unified_diff\`. This prevents errors from stale context.
2. If the patch application fails, **NEVER** manually retry the patch. The tool has already attempted an automatic self-heal.
3. If self-healing fails, your **ONLY** next step is to use the \`write_file\` tool to overwrite the entire file with the desired changes.

**Key Features:**
* **Multi-File Operations:** Can create, delete, and modify multiple files in a single operation.
* **Content-Based Matching:** The patch is applied based on the content of the context lines (' '), not on line numbers.
* **Partial Success:** The tool will attempt to apply every hunk independently. If some hunks succeed and others fail, the successful changes are kept.
* **Automatic Self-Healing:** If a hunk fails, the tool automatically tries to fix it.`,
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
