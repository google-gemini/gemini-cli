/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import * as Diff from 'diff';
import { WRITE_FILE_TOOL_NAME } from './tool-names.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../policy/types.js';

import type {
  FileDiff,
  ToolCallConfirmationDetails,
  ToolEditConfirmationDetails,
  ToolInvocation,
  ToolLocation,
  ToolResult,
} from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import {
  ensureCorrectEdit,
  ensureCorrectFileContent,
} from '../utils/editCorrector.js';
import { DEFAULT_DIFF_OPTIONS, getDiffStat } from './diffOptions.js';
import type {
  ModifiableDeclarativeTool,
  ModifyContext,
} from './modifiable-tool.js';
import { IdeClient } from '../ide/ide-client.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';
import { FileOperation } from '../telemetry/metrics.js';
import { getSpecificMimeType } from '../utils/fileUtils.js';
import { getLanguageFromFilePath } from '../utils/language-detection.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

/**
 * Parameters for the WriteFile tool
 */
export interface WriteFileToolParams {
  /**
   * The absolute path to the file to write to
   */
  file_path: string;

  /**
   * The content to write to the file
   */
  content: string;

  /**
   * Whether the proposed content was modified by the user.
   */
  modified_by_user?: boolean;

  /**
   * Initially proposed content.
   */
  ai_proposed_content?: string;
}

interface GetCorrectedFileContentResult {
  originalContent: string;
  correctedContent: string;
  fileExists: boolean;
  error?: { message: string; code?: string };
}

export async function getCorrectedFileContent(
  config: Config,
  filePath: string,
  proposedContent: string,
  abortSignal: AbortSignal,
): Promise<GetCorrectedFileContentResult> {
  let originalContent = '';
  let fileExists = false;
  let correctedContent = proposedContent;

  try {
    originalContent = await config
      .getFileSystemService()
      .readTextFile(filePath);
    fileExists = true; // File exists and was read
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      fileExists = false;
      originalContent = '';
    } else {
      // File exists but could not be read (permissions, etc.)
      fileExists = true; // Mark as existing but problematic
      originalContent = ''; // Can't use its content
      const error = {
        message: getErrorMessage(err),
        code: isNodeError(err) ? err.code : undefined,
      };
      // Return early as we can't proceed with content correction meaningfully
      return { originalContent, correctedContent, fileExists, error };
    }
  }

  // If readError is set, we have returned.
  // So, file was either read successfully (fileExists=true, originalContent set)
  // or it was ENOENT (fileExists=false, originalContent='').

  if (fileExists) {
    // This implies originalContent is available
    const { params: correctedParams } = await ensureCorrectEdit(
      filePath,
      originalContent,
      {
        old_string: originalContent, // Treat entire current content as old_string
        new_string: proposedContent,
        file_path: filePath,
      },
      config.getGeminiClient(),
      config.getBaseLlmClient(),
      abortSignal,
    );
    correctedContent = correctedParams.new_string;
  } else {
    // This implies new file (ENOENT)
    correctedContent = await ensureCorrectFileContent(
      proposedContent,
      config.getBaseLlmClient(),
      abortSignal,
    );
  }
  return { originalContent, correctedContent, fileExists };
}

class WriteFileToolInvocation extends BaseToolInvocation<
  WriteFileToolParams,
  ToolResult
> {
  private readonly resolvedPath: string;

  constructor(
    private readonly config: Config,
    params: WriteFileToolParams,
    messageBus?: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    super(params, messageBus, toolName, displayName);
    this.resolvedPath = path.resolve(
      this.config.getTargetDir(),
      this.params.file_path,
    );
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.resolvedPath }];
  }

  override getDescription(): string {
    const relativePath = makeRelative(
      this.resolvedPath,
      this.config.getTargetDir(),
    );
    return `Writing to ${shortenPath(relativePath)}`;
  }

  protected override async getConfirmationDetails(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const correctedContentResult = await getCorrectedFileContent(
      this.config,
      this.resolvedPath,
      this.params.content,
      abortSignal,
    );

    if (correctedContentResult.error) {
      // If file exists but couldn't be read, we can't show a diff for confirmation.
      return false;
    }

    const { originalContent, correctedContent } = correctedContentResult;
    const relativePath = makeRelative(
      this.resolvedPath,
      this.config.getTargetDir(),
    );
    const fileName = path.basename(this.resolvedPath);

    const fileDiff = Diff.createPatch(
      fileName,
      originalContent, // Original content (empty if new file or unreadable)
      correctedContent, // Content after potential correction
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );

    const ideClient = await IdeClient.getInstance();
    const ideConfirmation =
      this.config.getIdeMode() && ideClient.isDiffingEnabled()
        ? ideClient.openDiff(this.resolvedPath, correctedContent)
        : undefined;

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Write: ${shortenPath(relativePath)}`,
      fileName,
      filePath: this.resolvedPath,
      fileDiff,
      originalContent,
      newContent: correctedContent,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }

        if (ideConfirmation) {
          const result = await ideConfirmation;
          if (result.status === 'accepted' && result.content) {
            this.params.content = result.content;
          }
        }
      },
      ideConfirmation,
    };
    return confirmationDetails;
  }

  async execute(abortSignal: AbortSignal): Promise<ToolResult> {
    const { content, ai_proposed_content, modified_by_user } = this.params;
    const correctedContentResult = await getCorrectedFileContent(
      this.config,
      this.resolvedPath,
      content,
      abortSignal,
    );

    if (correctedContentResult.error) {
      const errDetails = correctedContentResult.error;
      const errorMsg = errDetails.code
        ? `Error checking existing file '${this.resolvedPath}': ${errDetails.message} (${errDetails.code})`
        : `Error checking existing file: ${errDetails.message}`;
      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
        error: {
          message: errorMsg,
          type: ToolErrorType.FILE_WRITE_FAILURE,
        },
      };
    }

    const {
      originalContent,
      correctedContent: fileContent,
      fileExists,
    } = correctedContentResult;
    // fileExists is true if the file existed (and was readable or unreadable but caught by readError).
    // fileExists is false if the file did not exist (ENOENT).
    const isNewFile =
      !fileExists ||
      (correctedContentResult.error !== undefined &&
        !correctedContentResult.fileExists);

    try {
      const dirName = path.dirname(this.resolvedPath);
      if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
      }

      await this.config
        .getFileSystemService()
        .writeTextFile(this.resolvedPath, fileContent);

      // Generate diff for display result
      const fileName = path.basename(this.resolvedPath);
      // If there was a readError, originalContent in correctedContentResult is '',
      // but for the diff, we want to show the original content as it was before the write if possible.
      // However, if it was unreadable, currentContentForDiff will be empty.
      const currentContentForDiff = correctedContentResult.error
        ? '' // Or some indicator of unreadable content
        : originalContent;

      const fileDiff = Diff.createPatch(
        fileName,
        currentContentForDiff,
        fileContent,
        'Original',
        'Written',
        DEFAULT_DIFF_OPTIONS,
      );

      const originallyProposedContent = ai_proposed_content || content;
      const diffStat = getDiffStat(
        fileName,
        currentContentForDiff,
        originallyProposedContent,
        content,
      );

      const llmSuccessMessageParts = [
        isNewFile
          ? `Successfully created and wrote to new file: ${this.resolvedPath}.`
          : `Successfully overwrote file: ${this.resolvedPath}.`,
      ];
      if (modified_by_user) {
        llmSuccessMessageParts.push(
          `User modified the \`content\` to be: ${content}`,
        );
      }

      // Log file operation for telemetry (without diff_stat to avoid double-counting)
      const mimetype = getSpecificMimeType(this.resolvedPath);
      const programmingLanguage = getLanguageFromFilePath(this.resolvedPath);
      const extension = path.extname(this.resolvedPath);
      const operation = isNewFile ? FileOperation.CREATE : FileOperation.UPDATE;

      logFileOperation(
        this.config,
        new FileOperationEvent(
          WRITE_FILE_TOOL_NAME,
          operation,
          fileContent.split('\n').length,
          mimetype,
          extension,
          programmingLanguage,
        ),
      );

      const displayResult: FileDiff = {
        fileDiff,
        fileName,
        originalContent: correctedContentResult.originalContent,
        newContent: correctedContentResult.correctedContent,
        diffStat,
      };

      return {
        llmContent: llmSuccessMessageParts.join(' '),
        returnDisplay: displayResult,
      };
    } catch (error) {
      // Capture detailed error information for debugging
      let errorMsg: string;
      let errorType = ToolErrorType.FILE_WRITE_FAILURE;

      if (isNodeError(error)) {
        // Handle specific Node.js errors with their error codes
        errorMsg = `Error writing to file '${this.resolvedPath}': ${error.message} (${error.code})`;

        // Log specific error types for better debugging
        if (error.code === 'EACCES') {
          errorMsg = `Permission denied writing to file: ${this.resolvedPath} (${error.code})`;
          errorType = ToolErrorType.PERMISSION_DENIED;
        } else if (error.code === 'ENOSPC') {
          errorMsg = `No space left on device: ${this.resolvedPath} (${error.code})`;
          errorType = ToolErrorType.NO_SPACE_LEFT;
        } else if (error.code === 'EISDIR') {
          errorMsg = `Target is a directory, not a file: ${this.resolvedPath} (${error.code})`;
          errorType = ToolErrorType.TARGET_IS_DIRECTORY;
        }

        // Include stack trace in debug mode for better troubleshooting
        if (this.config.getDebugMode() && error.stack) {
          console.error('Write file error stack:', error.stack);
        }
      } else if (error instanceof Error) {
        errorMsg = `Error writing to file: ${error.message}`;
      } else {
        errorMsg = `Error writing to file: ${String(error)}`;
      }

      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
        error: {
          message: errorMsg,
          type: errorType,
        },
      };
    }
  }
}

/**
 * Implementation of the WriteFile tool logic
 */
export class WriteFileTool
  extends BaseDeclarativeTool<WriteFileToolParams, ToolResult>
  implements ModifiableDeclarativeTool<WriteFileToolParams>
{
  static readonly Name = WRITE_FILE_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    super(
      WriteFileTool.Name,
      'WriteFile',
      `Writes content to a specified file in the local filesystem.

      The user has the ability to modify \`content\`. If modified, this will be stated in the response.`,
      Kind.Edit,
      {
        properties: {
          file_path: {
            description: 'The path to the file to write to.',
            type: 'string',
          },
          content: {
            description: 'The content to write to the file.',
            type: 'string',
          },
        },
        required: ['file_path', 'content'],
        type: 'object',
      },
      true,
      false,
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: WriteFileToolParams,
  ): string | null {
    const filePath = params.file_path;

    if (!filePath) {
      return `Missing or empty "file_path"`;
    }

    const resolvedPath = path.resolve(this.config.getTargetDir(), filePath);

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(resolvedPath)) {
      const directories = workspaceContext.getDirectories();
      return `File path must be within one of the workspace directories: ${directories.join(
        ', ',
      )}`;
    }

    try {
      if (fs.existsSync(resolvedPath)) {
        const stats = fs.lstatSync(resolvedPath);
        if (stats.isDirectory()) {
          return `Path is a directory, not a file: ${resolvedPath}`;
        }
      }
    } catch (statError: unknown) {
      return `Error accessing path properties for validation: ${resolvedPath}. Reason: ${
        statError instanceof Error ? statError.message : String(statError)
      }`;
    }

    return null;
  }

  protected createInvocation(
    params: WriteFileToolParams,
  ): ToolInvocation<WriteFileToolParams, ToolResult> {
    return new WriteFileToolInvocation(
      this.config,
      params,
      this.messageBus,
      this.name,
      this.displayName,
    );
  }

  getModifyContext(
    abortSignal: AbortSignal,
  ): ModifyContext<WriteFileToolParams> {
    return {
      getFilePath: (params: WriteFileToolParams) => params.file_path,
      getCurrentContent: async (params: WriteFileToolParams) => {
        const correctedContentResult = await getCorrectedFileContent(
          this.config,
          params.file_path,
          params.content,
          abortSignal,
        );
        return correctedContentResult.originalContent;
      },
      getProposedContent: async (params: WriteFileToolParams) => {
        const correctedContentResult = await getCorrectedFileContent(
          this.config,
          params.file_path,
          params.content,
          abortSignal,
        );
        return correctedContentResult.correctedContent;
      },
      createUpdatedParams: (
        _oldContent: string,
        modifiedProposedContent: string,
        originalParams: WriteFileToolParams,
      ) => {
        const content = originalParams.content;
        return {
          ...originalParams,
          ai_proposed_content: content,
          content: modifiedProposedContent,
          modified_by_user: true,
        };
      },
    };
  }
}
