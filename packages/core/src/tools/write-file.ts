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
import { ApprovalMode } from '../config/config.js';
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

  // Validate file path
  if (!filePath || typeof filePath !== 'string') {
    return {
      originalContent: '',
      correctedContent: proposedContent,
      fileExists: false,
      error: {
        message: 'Invalid file path provided',
        code: 'INVALID_PATH',
      },
    };
  }

  // Check file size before reading (if file exists)
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.size > 50 * 1024 * 1024) {
      // 50MB limit
      return {
        originalContent: '',
        correctedContent: proposedContent,
        fileExists: true,
        error: {
          message: `File too large (${(stats.size / (1024 * 1024)).toFixed(2)}MB). Maximum size is 50MB`,
          code: 'FILE_TOO_LARGE',
        },
      };
    }
  } catch (_statErr) {
    // File doesn't exist or can't stat, continue with read attempt
  }

  try {
    originalContent = await config
      .getFileSystemService()
      .readTextFile(filePath);
    fileExists = true; // File exists and was read
  } catch (err) {
    if (isNodeError(err)) {
      switch (err.code) {
        case 'ENOENT':
          fileExists = false;
          originalContent = '';
          break;
        case 'EACCES':
          return {
            originalContent: '',
            correctedContent: proposedContent,
            fileExists: true,
            error: {
              message: `Permission denied reading file '${filePath}'`,
              code: 'EACCES',
            },
          };
        case 'EISDIR':
          return {
            originalContent: '',
            correctedContent: proposedContent,
            fileExists: false,
            error: {
              message: `Path is a directory, not a file: '${filePath}'`,
              code: 'EISDIR',
            },
          };
        case 'ENOSPC':
          return {
            originalContent: '',
            correctedContent: proposedContent,
            fileExists: true,
            error: {
              message: `No space left on device for file '${filePath}'`,
              code: 'ENOSPC',
            },
          };
        case 'EIO':
          return {
            originalContent: '',
            correctedContent: proposedContent,
            fileExists: true,
            error: {
              message: `I/O error reading file '${filePath}'`,
              code: 'EIO',
            },
          };
        case 'EMFILE':
        case 'ENFILE': {
          return {
            originalContent: '',
            correctedContent: proposedContent,
            fileExists: true,
            error: {
              message: `Too many open files. Cannot read '${filePath}'`,
              code: err.code,
            },
          };
        }
        default: {
          // File exists but could not be read (permissions, etc.)
          fileExists = true; // Mark as existing but problematic
          originalContent = ''; // Can't use its content
          const error = {
            message: `File read error for '${filePath}': ${getErrorMessage(err)}`,
            code: err.code,
          };
          // Return early as we can't proceed with content correction meaningfully
          return { originalContent, correctedContent, fileExists, error };
        }
      }
    } else {
      // Non-Node.js error
      fileExists = true;
      originalContent = '';
      const error = {
        message: `Unknown error reading file '${filePath}': ${getErrorMessage(err)}`,
        code: 'UNKNOWN',
      };
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
  constructor(
    private readonly config: Config,
    params: WriteFileToolParams,
    messageBus?: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.params.file_path }];
  }

  override getDescription(): string {
    const relativePath = makeRelative(
      this.params.file_path,
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
      this.params.file_path,
      this.params.content,
      abortSignal,
    );

    if (correctedContentResult.error) {
      // If file exists but couldn't be read, we can't show a diff for confirmation.
      return false;
    }

    const { originalContent, correctedContent } = correctedContentResult;
    const relativePath = makeRelative(
      this.params.file_path,
      this.config.getTargetDir(),
    );
    const fileName = path.basename(this.params.file_path);

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
        ? ideClient.openDiff(this.params.file_path, correctedContent)
        : undefined;

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Write: ${shortenPath(relativePath)}`,
      fileName,
      filePath: this.params.file_path,
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
    const { file_path, content, ai_proposed_content, modified_by_user } =
      this.params;

    // Validate parameters before processing
    const validation = validateWriteFileParams(file_path, content);
    if (!validation.valid) {
      return {
        llmContent: `Error: ${validation.error}`,
        returnDisplay: validation.error!,
        error: {
          message: validation.error!,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }
    const correctedContentResult = await getCorrectedFileContent(
      this.config,
      file_path,
      content,
      abortSignal,
    );

    if (correctedContentResult.error) {
      const errDetails = correctedContentResult.error;
      const errorMsg = errDetails.code
        ? `Error checking existing file '${file_path}': ${errDetails.message} (${errDetails.code})`
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
      // Validate file path before writing
      if (!file_path || typeof file_path !== 'string') {
        throw new Error('Invalid file path provided');
      }

      // Check if file path is within workspace
      if (!this.config.getWorkspaceContext().isPathWithinWorkspace(file_path)) {
        throw new Error(
          `File path '${file_path}' is outside the allowed workspace`,
        );
      }

      // Check file size before writing
      if (fileContent.length > 100 * 1024 * 1024) {
        // 100MB limit
        throw new Error(
          `Content too large (${(fileContent.length / (1024 * 1024)).toFixed(2)}MB). Maximum size is 100MB`,
        );
      }

      const dirName = path.dirname(file_path);
      if (!fs.existsSync(dirName)) {
        try {
          fs.mkdirSync(dirName, { recursive: true });
        } catch (mkdirErr) {
          if (isNodeError(mkdirErr)) {
            switch (mkdirErr.code) {
              case 'EACCES':
                throw new Error(
                  `Permission denied creating directory '${dirName}'`,
                );
              case 'ENOSPC':
                throw new Error(
                  `No space left on device. Cannot create directory '${dirName}'`,
                );
              case 'ENAMETOOLONG':
                throw new Error(`Directory path too long: '${dirName}'`);
              default:
                throw new Error(
                  `Failed to create directory '${dirName}': ${mkdirErr.message}`,
                );
            }
          }
          throw mkdirErr;
        }
      }

      await this.config
        .getFileSystemService()
        .writeTextFile(file_path, fileContent);

      // Generate diff for display result
      const fileName = path.basename(file_path);
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
          ? `Successfully created and wrote to new file: ${file_path}.`
          : `Successfully overwrote file: ${file_path}.`,
      ];
      if (modified_by_user) {
        llmSuccessMessageParts.push(
          `User modified the \`content\` to be: ${content}`,
        );
      }

      // Log file operation for telemetry (without diff_stat to avoid double-counting)
      const mimetype = getSpecificMimeType(file_path);
      const programmingLanguage = getLanguageFromFilePath(file_path);
      const extension = path.extname(file_path);
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
        switch (error.code) {
          case 'EACCES':
            errorMsg = `Permission denied writing to file: ${file_path}`;
            errorType = ToolErrorType.PERMISSION_DENIED;
            break;
          case 'ENOSPC':
            errorMsg = `No space left on device: ${file_path}`;
            errorType = ToolErrorType.NO_SPACE_LEFT;
            break;
          case 'EISDIR':
            errorMsg = `Target is a directory, not a file: ${file_path}`;
            errorType = ToolErrorType.TARGET_IS_DIRECTORY;
            break;
          case 'ENAMETOOLONG':
            errorMsg = `File path too long: ${file_path}`;
            errorType = ToolErrorType.INVALID_TOOL_PARAMS;
            break;
          case 'EIO':
            errorMsg = `I/O error writing to file: ${file_path}`;
            errorType = ToolErrorType.FILE_WRITE_FAILURE;
            break;
          case 'EMFILE':
          case 'ENFILE': {
            errorMsg = `Too many open files. Cannot write to: ${file_path}`;
            errorType = ToolErrorType.FILE_WRITE_FAILURE;
            break;
          }
          case 'ENOTDIR':
            errorMsg = `Path component is not a directory: ${file_path}`;
            errorType = ToolErrorType.PATH_NOT_IN_WORKSPACE;
            break;
          case 'EROFS':
            errorMsg = `Read-only file system. Cannot write to: ${file_path}`;
            errorType = ToolErrorType.PERMISSION_DENIED;
            break;
          case 'EEXIST':
            errorMsg = `File already exists and cannot be overwritten: ${file_path}`;
            errorType = ToolErrorType.FILE_WRITE_FAILURE;
            break;
          default:
            errorMsg = `Error writing to file '${file_path}': ${error.message} (${error.code})`;
            errorType = ToolErrorType.FILE_WRITE_FAILURE;
        }

        // Include stack trace in debug mode for better troubleshooting
        if (this.config.getDebugMode() && error.stack) {
          console.error('Write file error stack:', error.stack);
        }
      } else if (error instanceof Error) {
        errorMsg = `Error writing to file '${file_path}': ${error.message}`;
      } else {
        errorMsg = `Error writing to file '${file_path}': ${String(error)}`;
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
 * Validates file path and content for write operations
 */
function validateWriteFileParams(
  filePath: string,
  content: string,
): { valid: boolean; error?: string } {
  // Validate file path
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'Invalid file path provided' };
  }

  // Check for path traversal attempts
  if (filePath.includes('..') || filePath.includes('~')) {
    return {
      valid: false,
      error: 'File path contains potentially unsafe characters',
    };
  }

  // Validate content
  if (typeof content !== 'string') {
    return { valid: false, error: 'Content must be a string' };
  }

  // Check content size
  if (content.length > 100 * 1024 * 1024) {
    // 100MB limit
    return {
      valid: false,
      error: `Content too large (${(content.length / (1024 * 1024)).toFixed(2)}MB). Maximum size is 100MB`,
    };
  }

  return { valid: true };
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
            description:
              "The absolute path to the file to write to (e.g., '/home/user/project/file.txt'). Relative paths are not supported.",
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

    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute: ${filePath}`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(filePath)) {
      const directories = workspaceContext.getDirectories();
      return `File path must be within one of the workspace directories: ${directories.join(
        ', ',
      )}`;
    }

    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.lstatSync(filePath);
        if (stats.isDirectory()) {
          return `Path is a directory, not a file: ${filePath}`;
        }
      }
    } catch (statError: unknown) {
      return `Error accessing path properties for validation: ${filePath}. Reason: ${
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
