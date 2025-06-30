/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
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
import { recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';
import { logger } from '../core/logger.js';

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
   * Optional: If true, content will be appended to the file instead of overwriting.
   */
  append?: boolean;

  /**
   * Optional: If true, content will be prepended to the file instead of overwriting.
   */
  prepend?: boolean;
}

interface GetCorrectedFileContentResult {
  originalContent: string;
  correctedContent: string;
  fileExists: boolean;
  error?: { message: string; code?: string };
}

/**
 * Implementation of the WriteFile tool logic
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
      `Writes content to a specified file in the local filesystem. 
      
      The user has the ability to modify \`content\`. If modified, this will be stated in the response.`,
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
          append: {
            description:
              'Optional: If true, content will be appended to the file instead of overwriting.',
            type: 'boolean',
          },
          prepend: {
            description:
              'Optional: If true, content will be prepended to the file instead of overwriting.',
            type: 'boolean',
          },
        },
        required: ['file_path', 'content'],
        type: 'object',
      },
    );

    this.client = this.config.getGeminiClient();
  }

  private isWithinRoot(pathToCheck: string): boolean {
    const normalizedPath = path.normalize(pathToCheck);
    const normalizedRoot = path.normalize(this.config.getTargetDir());
    const rootWithSep = normalizedRoot.endsWith(path.sep)
      ? normalizedRoot
      : normalizedRoot + path.sep;
    return (
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(rootWithSep)
    );
  }

  override validateToolParams(params: WriteFileToolParams): string | null {
    logger.debug(`Validating write_file parameters: ${JSON.stringify(params)}`);
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      logger.error('Parameters failed schema validation for write_file.');
      return 'Parameters failed schema validation.';
    }
    const filePath = params.file_path;
    if (!path.isAbsolute(filePath)) {
      logger.error(`File path must be absolute, but was relative: ${filePath}`);
      return `File path must be absolute: ${filePath}`;
    }
    if (!this.isWithinRoot(filePath)) {
      logger.error(`File path must be within the root directory (${this.config.getTargetDir()}): ${filePath}`);
      return `File path must be within the root directory (${this.config.getTargetDir()}): ${filePath}`;
    }

    if (params.append && params.prepend) {
      logger.error('Cannot use both append and prepend modes simultaneously for write_file.');
      return 'Cannot use both append and prepend modes simultaneously.';
    }

    try {
      // This check should be performed only if the path exists.
      // If it doesn't exist, it's a new file, which is valid for writing.
      if (fs.existsSync(filePath)) {
        logger.debug(`Checking if path is a directory: ${filePath}`);
        const stats = fs.lstatSync(filePath);
        if (stats.isDirectory()) {
          logger.error(`Path is a directory, not a file: ${filePath}`);
          return `Path is a directory, not a file: ${filePath}`;
        }
      }
    } catch (statError: unknown) {
      // If fs.existsSync is true but lstatSync fails (e.g., permissions, race condition where file is deleted)
      // this indicates an issue with accessing the path that should be reported.
      logger.error(`Error accessing path properties for validation: ${filePath}. Reason: ${statError instanceof Error ? statError.message : String(statError)}`);
      return `Error accessing path properties for validation: ${filePath}. Reason: ${statError instanceof Error ? statError.message : String(statError)}`;
    }
    logger.debug('Write file parameters validated successfully.');
    return null;
  }

  override getDescription(params: WriteFileToolParams): string {
    if (!params.file_path || !params.content) {
      return `Model did not provide valid parameters for write file tool`;
    }
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    return `Writing to ${shortenPath(relativePath)}`;
  }

  /**
   * Handles the confirmation prompt for the WriteFile tool.
   */
  override async shouldConfirmExecute(
    params: WriteFileToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false;
    }

    const correctedContentResult = await this._getCorrectedFileContent(
      params.file_path,
      params.content,
      abortSignal,
    );

    if (correctedContentResult.error) {
      // If file exists but couldn't be read, we can't show a diff for confirmation.
      return false;
    }

    const { originalContent, correctedContent } = correctedContentResult;
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    const fileName = path.basename(params.file_path);

    const fileDiff = Diff.createPatch(
      fileName,
      originalContent, // Original content (empty if new file or unreadable)
      correctedContent, // Content after potential correction
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Write: ${shortenPath(relativePath)}`,
      fileName,
      fileDiff,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    params: WriteFileToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    logger.info(`Executing write_file command for: ${params.file_path}`);
    logger.debug(`Write file parameters: ${JSON.stringify(params)}`);

    const validationError = this.validateToolParams(params);
    if (validationError) {
      logger.error(`Write file validation failed: ${validationError}`);
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const correctedContentResult = await this._getCorrectedFileContent(
      params.file_path,
      params.content,
      abortSignal,
    );

    if (correctedContentResult.error) {
      const errDetails = correctedContentResult.error;
      const errorMsg = `Error checking existing file: ${errDetails.message}`;
      logger.error(`Error checking existing file ${params.file_path}: ${errDetails.message}`, errDetails);
      return {
        llmContent: `Error checking existing file ${params.file_path}: ${errDetails.message}`,
        returnDisplay: errorMsg,
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

    const { file_path, content, append, prepend } = params;

    try {
      const dirName = path.dirname(file_path);
      if (!fs.existsSync(dirName)) {
        logger.debug(`Creating directory: ${dirName}`);
        fs.mkdirSync(dirName, { recursive: true });
        logger.info(`Directory created: ${dirName}`);
      }

      if (append) {
        logger.info(`Appending content to file: ${file_path}`);
        fs.appendFileSync(file_path, content, 'utf8');
      } else if (prepend) {
        logger.info(`Prepending content to file: ${file_path}`);
        const existingContent = fs.existsSync(file_path)
          ? fs.readFileSync(file_path, 'utf8')
          : '';
        const tempFilePath = `${file_path}.tmp.${Date.now()}`;
        fs.writeFileSync(tempFilePath, content + existingContent, 'utf8');
        fs.renameSync(tempFilePath, file_path);
        logger.debug(`Content prepended and temporary file renamed for: ${file_path}`);
      } else {
        logger.info(`Overwriting file: ${file_path}`);
        // Atomic write for overwrite mode
        const tempFilePath = `${file_path}.tmp.${Date.now()}`;
        fs.writeFileSync(tempFilePath, content, 'utf8');
        fs.renameSync(tempFilePath, file_path);
        logger.debug(`Content overwritten and temporary file renamed for: ${file_path}`);
      }

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

      const llmSuccessMessageParts = [
        isNewFile
          ? `Successfully created and wrote to new file: ${file_path}.`
          : `Successfully overwrote file: ${file_path}.`,
      ];
      if (params.modified_by_user) {
        llmSuccessMessageParts.push(
          `User modified the 'content' to be: ${params.content}`,
        );
      }

      const displayResult: FileDiff = { fileDiff, fileName };

      const lines = fileContent.split('\n').length;
      const mimetype = getSpecificMimeType(file_path);
      const extension = path.extname(file_path); // Get extension
      if (isNewFile) {
        recordFileOperationMetric(
          this.config,
          FileOperation.CREATE,
          lines,
          mimetype,
          extension,
        );
        logger.info(`File created metric recorded for: ${file_path}`);
      } else {
        recordFileOperationMetric(
          this.config,
          FileOperation.UPDATE,
          lines,
          mimetype,
          extension,
        );
        logger.info(`File updated metric recorded for: ${file_path}`);
      }
      logger.info(`Write file operation complete for: ${file_path}`);
      return {
        llmContent: llmSuccessMessageParts.join(' '),
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMsg = `Error writing to file: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`Error writing to file ${file_path}: ${errorMsg}`, error);
      return {
        llmContent: `Error writing to file ${file_path}: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }

  private async _getCorrectedFileContent(
    filePath: string,
    proposedContent: string,
    abortSignal: AbortSignal,
  ): Promise<GetCorrectedFileContentResult> {
    let originalContent = '';
    let fileExists = false;
    let correctedContent = proposedContent;

    try {
      originalContent = fs.readFileSync(filePath, 'utf8');
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
    } else {
      // This implies new file (ENOENT)
      correctedContent = await ensureCorrectFileContent(
        proposedContent,
        this.client,
        abortSignal,
      );
    }
    return { originalContent, correctedContent, fileExists };
  }

  getModifyContext(
    abortSignal: AbortSignal,
  ): ModifyContext<WriteFileToolParams> {
    return {
      getFilePath: (params: WriteFileToolParams) => params.file_path,
      getCurrentContent: async (params: WriteFileToolParams) => {
        const correctedContentResult = await this._getCorrectedFileContent(
          params.file_path,
          params.content,
          abortSignal,
        );
        return correctedContentResult.originalContent;
      },
      getProposedContent: async (params: WriteFileToolParams) => {
        const correctedContentResult = await this._getCorrectedFileContent(
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
      ) => ({
        ...originalParams,
        content: modifiedProposedContent,
        modified_by_user: true,
      }),
    };
  }
}
