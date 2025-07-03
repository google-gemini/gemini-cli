/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises'; // Use promises API for async operations
import path from 'path';
import * as Diff from 'diff';
import { Config, ApprovalMode } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  FileDiff,
  ToolEditConfirmationDetails,
  ToolConfirmationOutcome,
  ToolCallConfirmationDetails,
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import {
  ensureCorrectEdit,
  ensureCorrectFileContent,
} from '../utils/editCorrector.js';
import { GeminiClient } from '../core/client.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { ModifiableTool, ModifyContext } from './modifiable-tool.js';
import { getSpecificMimeType } from '../utils/fileUtils.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';
import Handlebars from 'handlebars';

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
  content?: string;

  /**
   * The template to use for generating the content
   */
  template?: string;

  /**
   * The variables to use with the template
   */
  variables?: Record<string, unknown>;

  /**
   * Whether the proposed content was modified by the user.
   */
  modified_by_user?: boolean;
}

/**
 * Result interface for _getCorrectedFileContent, providing comprehensive status.
 */
interface GetCorrectedFileContentResult {
  originalContent: string; // The content read from the file, or empty string.
  correctedContent: string; // The content after potential LLM correction.
  fileExists: boolean; // True if the file existed, regardless of readability.
  isReadable: boolean; // True if the file existed AND was successfully read.
  error?: { message: string; code?: string }; // Error details if file existed but couldn't be read.
}

/**
 * Implementation of the WriteFile tool logic.
 * This tool allows writing content to a specified file, with robust path validation,
 * user confirmation flow, and automatic content correction via LLM if enabled.
 * It integrates with telemetry for file operation tracking.
 */
export class WriteFileTool
  extends BaseTool<WriteFileToolParams, ToolResult>
  implements ModifiableTool<WriteFileToolParams>
{
  static readonly Name: string = 'write_file';
  private readonly client: GeminiClient;

  constructor(private readonly config: Config) {
    super(
      WriteFileTool.Name,
      'WriteFile',
      `Writes content to a specified file in the local filesystem. Can also use a template to generate content.`,
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
          template: {
            description: 'The template to use for generating the content.',
            type: 'string',
          },
          variables: {
            description: 'The variables to use with the template.',
            type: 'object',
          },
        },
        required: ['file_path'],
        type: 'object',
      },
    );

    this.client = this.config.getGeminiClient();
  }

  /**
   * Checks if the given path is within the configured root directory.
   * @param pathToCheck The absolute path to validate.
   * @returns True if the path is within the root, false otherwise.
   */
  private isWithinRoot(pathToCheck: string): boolean {
    const normalizedPath = path.normalize(pathToCheck);
    const normalizedRoot = path.normalize(this.config.getTargetDir());

    // Ensure the root path ends with a separator to correctly check subdirectories
    // without matching prefixes that are not true subdirectories (e.g., /root and /root-dir)
    const rootWithSep = normalizedRoot.endsWith(path.sep)
      ? normalizedRoot
      : normalizedRoot + path.sep;

    return (
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(rootWithSep)
    );
  }

  /**
   * Validates the parameters for the WriteFile tool, ensuring path safety and correctness.
   * @param params The parameters provided to the tool.
   * @returns A string with an error message if validation fails, otherwise null.
   */
  async validateToolParams(params: WriteFileToolParams): Promise<string | null> {
    // 1. Schema Validation
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }

    if (!params.content && !params.template) {
      return 'Either `content` or `template` must be provided.';
    }

    if (params.content && params.template) {
      return '`content` and `template` cannot be used at the same time.';
    }

    if (params.template && !params.variables) {
      return '`variables` must be provided when using a `template`.';
    }

    const filePath = params.file_path;

    // 2. Absolute Path Check
    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute: ${filePath}`;
    }

    // 3. Within Root Directory Check
    if (!this.isWithinRoot(filePath)) {
      return `File path must be within the root directory (${this.config.getTargetDir()}): ${filePath}`;
    }

    // 4. Directory Check (if path exists)
    try {
      // Use fs.promises.stat for async check and to avoid race conditions with lstatSync
      const stats = await fs.stat(filePath).catch((err: unknown) => {
        if (isNodeError(err) && err.code === 'ENOENT') {
          return null; // File does not exist, which is fine for writing (new file)
        }
        throw err; // Re-throw other errors
      });

      if (stats && stats.isDirectory()) {
        return `Path is a directory, not a file: ${filePath}`;
      }
    } catch (statError: unknown) {
      // If fs.stat fails for reasons other than ENOENT (e.g., permissions), report it.
      return `Error accessing path properties for validation: ${filePath}. Reason: ${getErrorMessage(statError)}`;
    }

    return null; // All validations passed
  }

  /**
   * Provides a concise description of the tool's action based on its parameters.
   * @param params The parameters for the WriteFile tool.
   * @returns A string describing the action.
   */
  getDescription(params: WriteFileToolParams): string {
    if (!params.file_path && (!params.content && !params.template)) {
      return `Model did not provide valid parameters for write file tool`;
    }
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    return `Writing to ${shortenPath(relativePath)}`;
  }

  /**
   * Handles the confirmation prompt for the WriteFile tool, showing a diff if applicable.
   * @param params The parameters for the tool call.
   * @param abortSignal An AbortSignal to cancel ongoing operations.
   * @returns Details for confirmation or false if no confirmation is needed.
   */
  async shouldConfirmExecute(
    params: WriteFileToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false; // Auto-approve in AUTO_EDIT mode
    }

    const validationError = await this.validateToolParams(params);
    if (validationError) {
      // If validation fails, do not confirm and let execute handle the error message.
      return false;
    }

    const content = params.content ?? this._renderTemplate(params.template!, params.variables!);

    const correctedContentResult = await this._getCorrectedFileContent(
      params.file_path,
      content,
      abortSignal,
    );

    // If file existed but was unreadable, we can't show a meaningful diff.
    if (!correctedContentResult.isReadable && correctedContentResult.fileExists) {
      return false;
    }

    const { originalContent, correctedContent } = correctedContentResult;
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    const fileName = path.basename(params.file_path);

    // Create the diff for display. Original content will be empty if new file or unreadable.
    const fileDiff = Diff.createPatch(
      fileName,
      originalContent, // Content before the write operation
      correctedContent, // Content after potential LLM correction, ready to be written
      'Current', // Label for the original content
      'Proposed', // Label for the new content
      DEFAULT_DIFF_OPTIONS,
    );

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Write: ${shortenPath(relativePath)}`,
      fileName,
      fileDiff,
      // Callback to handle user's confirmation outcome
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          // If user chooses "Proceed Always", set approval mode to AUTO_EDIT for future operations.
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  /**
   * Executes the WriteFile tool, performing the file write operation.
   * @param params The parameters for the tool call.
   * @param abortSignal An AbortSignal to cancel ongoing operations.
   * @returns A ToolResult indicating success or failure.
   */
  async execute(
    params: WriteFileToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = await this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    // Permission check
    const permissionService = this.config.getFilePermissionService();
    if (!permissionService.canPerformOperation(params.file_path, 'write')) {
      const relativePath = makeRelative(params.file_path, this.config.getTargetDir());
      const errorMessage = `Write operation on file '${shortenPath(relativePath)}' denied by file permission configuration.`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }

    const content = params.content ?? this._renderTemplate(params.template!, params.variables!);

    const correctedContentResult = await this._getCorrectedFileContent(
      params.file_path,
      content,
      abortSignal,
    );

    // Handle cases where file existed but was unreadable.
    if (!correctedContentResult.isReadable && correctedContentResult.fileExists) {
      const errDetails = correctedContentResult.error;
      const errorMsg = `Error checking existing file: ${errDetails?.message || 'Unknown error'}`;
      return {
        llmContent: `Error checking existing file ${params.file_path}: ${errDetails?.message || 'Unknown error'}`,
        returnDisplay: errorMsg,
      };
    }

    const {
      originalContent,
      correctedContent: fileContent,
      fileExists,
    } = correctedContentResult;

    // Determine if it's a new file or an overwrite.
    const isNewFile = !fileExists;

    try {
      const dirName = path.dirname(params.file_path);
      // Ensure the directory exists; create recursively if not.
      await fs.mkdir(dirName, { recursive: true });

      // Write the file content.
      await fs.writeFile(params.file_path, fileContent, 'utf8');

      // Generate diff for the return display, showing 'Original' vs 'Written'.
      const fileName = path.basename(params.file_path);
      const fileDiff = Diff.createPatch(
        fileName,
        originalContent, // This is the actual content before the write, or empty for new files.
        fileContent, // The content that was just written.
        'Original',
        'Written',
        DEFAULT_DIFF_OPTIONS,
      );

      const llmSuccessMessageParts = [
        isNewFile
          ? `Successfully created and wrote to new file: ${params.file_path}.`
          : `Successfully overwrote file: ${params.file_path}.`,
      ];
      if (params.modified_by_user) {
        llmSuccessMessageParts.push(
          `User modified the content to be: ${params.content}`,
        );
      }

      const displayResult: FileDiff = { fileDiff, fileName };

      // Record telemetry metrics.
      const lines = fileContent.split('\n').length;
      const mimetype = getSpecificMimeType(params.file_path);
      const extension = path.extname(params.file_path);

      if (isNewFile) {
        recordFileOperationMetric(
          this.config,
          FileOperation.CREATE,
          lines,
          mimetype,
          extension,
        );
      } else {
        recordFileOperationMetric(
          this.config,
          FileOperation.UPDATE,
          lines,
          mimetype,
          extension,
        );
      }

      return {
        llmContent: llmSuccessMessageParts.join(' '),
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMsg = `Error writing to file: ${getErrorMessage(error)}`;
      return {
        llmContent: `Error writing to file ${params.file_path}: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }

  /**
   * Attempts to read the original file content and then corrects the proposed content
   * using the LLM, if necessary. Handles cases where the file doesn't exist or is unreadable.
   * @param filePath The path to the file.
   * @param proposedContent The content proposed by the LLM.
   * @param abortSignal An AbortSignal to cancel LLM operations.
   * @returns A GetCorrectedFileContentResult object.
   */
  private async _getCorrectedFileContent(
    filePath: string,
    proposedContent: string,
    abortSignal: AbortSignal,
  ): Promise<GetCorrectedFileContentResult> {
    let originalContent = '';
    let fileExists = false;
    let isReadable = false;
    let correctedContent = proposedContent;
    let error: { message: string; code?: string } | undefined;

    try {
      originalContent = await fs.readFile(filePath, 'utf8');
      fileExists = true;
      isReadable = true; // File existed and was successfully read
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        fileExists = false; // File does not exist
        originalContent = '';
      } else {
        // File exists but could not be read (e.g., permissions, corrupted file)
        fileExists = true;
        isReadable = false; // File exists but not readable
        originalContent = ''; // Can't use its content
        error = {
          message: getErrorMessage(err),
          code: isNodeError(err) ? err.code : undefined,
        };
      }
    }

    // Only attempt correction if the file was readable (exists and content is available)
    // or if it's a new file (ENOENT, so originalContent is '').
    // If fileExists is true but isReadable is false, we cannot perform content-based correction.
    if (isReadable) {
      const { params: correctedParams } = await ensureCorrectEdit(
        originalContent,
        {
          old_string: originalContent, // Treat entire current content as old_string
          new_string: proposedContent,
          file_path: filePath,
        },
        this.client,
        abortSignal,
      );
      correctedContent = correctedParams.new_string;
    } else if (!fileExists) { // This implies a new file (ENOENT case)
      correctedContent = await ensureCorrectFileContent(
        proposedContent,
        this.client,
        abortSignal,
      );
    }
    // If fileExists is true and isReadable is false, correctedContent remains proposedContent,
    // and an error will be indicated in the result.

    return { originalContent, correctedContent, fileExists, isReadable, error };
  }

  /**
   * Provides context for modifying the tool's parameters, specifically for file content.
   * This is used by the UI/agent to allow user modifications to the file content.
   * @param abortSignal An AbortSignal to cancel LLM operations.
   * @returns A ModifyContext object.
   */
  getModifyContext(
    abortSignal: AbortSignal,
  ): ModifyContext<WriteFileToolParams> {
    return {
      getFilePath: (params: WriteFileToolParams) => params.file_path,
      getCurrentContent: async (params: WriteFileToolParams) => {
        const content = params.content ?? this._renderTemplate(params.template!, params.variables!);
        const correctedContentResult = await this._getCorrectedFileContent(
          params.file_path,
          content,
          abortSignal,
        );
        // Only return originalContent if it was successfully read.
        // Otherwise, returning empty string implies it's a new file or unreadable.
        return correctedContentResult.isReadable ? correctedContentResult.originalContent : '';
      },
      getProposedContent: async (params: WriteFileToolParams) => {
        const content = params.content ?? this._renderTemplate(params.template!, params.variables!);
        const correctedContentResult = await this._getCorrectedFileContent(
          params.file_path,
          content,
          abortSignal,
        );
        return correctedContentResult.correctedContent;
      },
      createUpdatedParams: (
        _oldContent: string, // `_oldContent` is unused here, but part of the interface
        modifiedProposedContent: string,
        originalParams: WriteFileToolParams,
      ) => ({
        ...originalParams,
        content: modifiedProposedContent,
        template: undefined,
        variables: undefined,
        modified_by_user: true, // Indicate that the content was user-modified
      }),
    };
  }

  private _renderTemplate(template: string, variables: Record<string, unknown>): string {
    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate(variables);
  }
}
