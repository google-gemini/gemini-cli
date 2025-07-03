/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as Diff from 'diff';
import chalk from 'chalk';
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
import { ReadFileTool } from './read-file.js';
import { ModifiableTool, ModifyContext } from './modifiable-tool.js';

// Centralized logger for Termux
const logger = {
  info: (msg: string) => console.log(chalk.cyan(`// [INFO] ${msg}`)),
  warn: (msg: string) => console.log(chalk.yellow(`// [WARN] ${msg}`)),
  error: (msg: string) => console.log(chalk.red(`// [ERROR] ${msg}`)),
};

/**
 * Parameters for the Edit tool
 */
export interface EditToolParams {
  file_path: string;
  old_string: string;
  new_string: string;
  expected_replacements?: number;
  modified_by_user?: boolean;
  reason?: string;
  dry_run?: boolean;
  use_regex?: boolean; // New: Allow regex for old_string
}

/**
 * Represents the calculated outcome of an edit operation
 */
interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  occurrences: number;
  error?: { display: string; raw: string; code?: string; suggestions?: string[] };
  isNewFile: boolean;
  finalOldString: string;
  finalNewString: string;
  originalParams: EditToolParams;
  timestamp: Date;
}

/**
 * Common error messages
 */
const ErrorMessages = {
 (FILE_NOT_FOUND: 'File not found.',
  FILE_ALREADY_EXISTS: 'File already exists.',
  STRING_NOT_FOUND: 'Failed to edit, could not find the string to replace.',
  REPLACEMENT_MISMATCH: 'Failed to edit, expected {expected} {term} but found {found}.',
  INVALID_PARAMETERS: 'Invalid parameters provided.',
  ROOT_DIRECTORY_VIOLATION: 'File path must be within the root directory.',
  ABSOLUTE_PATH_REQUIRED: 'File path must be absolute.',
  FAILED_TO_READ_CONTENT: 'Failed to read content of file.',
  FAILED_TO_WRITE_FILE: 'Error writing file.',
  ERROR_PREPARING_EDIT: 'Error preparing edit:',
  EMPTY_NEW_STRING_ERROR: 'Cannot replace content with an empty string unless creating a new file.',
  INVALID_FILE_TYPE: 'Target path is not a file or is a directory.',
  REGEX_INVALID: 'Invalid regex pattern provided for old_string.',
};

/**
 * Enhanced EditTool for Termux
 */
export class EditTool
  extends BaseTool<EditToolParams, ToolResult>
  implements ModifiableTool<EditToolParams>
{
  static readonly Name = 'replace';
  private readonly config: Config;
  private readonly rootDirectory: string;
  private readonly client: GeminiClient;
  private fileCache: Map<string, string> = new Map(); // Cache file contents

  constructor(config: Config) {
    super(
      EditTool.Name,
      'Edit',
      `Replaces text within a file in the Termux realm, weaving precision and power. By default, replaces a single occurrence, but can replace multiple with \`expected_replacements\`. Use regex with \`use_regex: true\` for complex patterns. Always summon \`${ReadFileTool.Name}\` to inspect file content first.

      **Parameters**:
      - \`file_path\`: Absolute path (e.g., /data/data/com.termux/files/home/...).
      - \`old_string\`: Exact text or regex pattern (if \`use_regex\`) to replace, including 3+ lines of context.
      - \`new_string\`: Replacement text, preserving code style.
      - \`expected_replacements\`: Number of replacements (default: 1).
      - \`use_regex\`: If true, treat \`old_string\` as a regex pattern.
      - \`reason\`: Purpose of the edit.
      - \`dry_run\`: If true, preview changes without writing.

      **Critical**: \`old_string\` must uniquely match or use regex. Use \`${ReadFileTool.Name}\` to verify content. For new files, set \`old_string\` to empty string.`,
      {
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file.' },
          old_string: { type: 'string', description: 'Exact text or regex pattern to replace.' },
          new_string: { type: 'string', description: 'Replacement text.' },
          expected_replacements: { type: 'number', description: 'Number of replacements.', minimum: 1 },
          reason: { type: 'string', description: 'Purpose of the edit.', optional: true },
          dry_run: { type: 'boolean', description: 'Preview changes without writing.', optional: true },
          use_regex: { type: 'boolean', description: 'Treat old_string as regex.', optional: true },
        },
        required: ['file_path', 'old_string', 'new_string'],
        type: 'object',
      },
    );
    this.config = config;
    this.rootDirectory = path.resolve(this.config.getTargetDir() || '/data/data/com.termux/files/home');
    this.client = config.getGeminiClient();
    logger.info(`EditTool forged for Termux realm at ${this.rootDirectory}`);
  }

  private isWithinRoot(pathToCheck: string): boolean {
    const normalizedPath = path.normalize(pathToCheck);
    const normalizedRoot = this.rootDirectory;
    const relative = path.relative(normalizedRoot, normalizedPath);
    const isValid = !relative.startsWith('..') && !path.isAbsolute(relative);
    if (!isValid) {
      logger.warn(`Path ${pathToCheck} attempts to escape the root ${normalizedRoot}`);
    }
    return isValid;
  }

  validateToolParams(params: EditToolParams): string | null {
    if (!SchemaValidator.validate(this.schema.parameters as Record<string, unknown>, params)) {
      const errors = SchemaValidator.validate(this.schema.parameters as Record<string, unknown>, params, true);
      const errorMsg = typeof errors === 'string' ? errors : 'Schema validation failed.';
      logger.error(`Validation failed: ${errorMsg}`);
      return `Parameters failed schema validation: ${errorMsg}`;
    }

    if (!path.isAbsolute(params.file_path)) {
      logger.error(`Non-absolute path: ${params.file_path}`);
      return `${ErrorMessages.ABSOLUTE_PATH_REQUIRED}: ${params.file_path}`;
    }

    if (!this.isWithinRoot(params.file_path)) {
      return `${ErrorMessages.ROOT_DIRECTORY_VIOLATION} (${this.rootDirectory}): ${params.file_path}`;
    }

    if (params.old_string !== '' && params.new_string === '') {
      logger.error('Attempted to replace with empty new_string');
      return ErrorMessages.EMPTY_NEW_STRING_ERROR;
    }

    if (params.use_regex) {
      try {
        new RegExp(params.old_string);
      } catch (err) {
        logger.error(`Invalid regex: ${params.old_string}`);
        return `${ErrorMessages.REGEX_INVALID}: ${String(err)}`;
      }
    }

    return null;
  }

  private applyReplacement(
    currentContent: string | null,
    oldString: string,
    newString: string,
    isNewFile: boolean,
    useRegex: boolean = false,
  ): { newContent: string; occurrences: number } {
    if (isNewFile) {
      return { newContent: newString, occurrences: 1 };
    }
    if (currentContent === null) {
      throw new Error(ErrorMessages.FAILED_TO_READ_CONTENT);
    }
    if (oldString === '' && !isNewFile) {
      return { newContent: currentContent, occurrences: 0 };
    }

    let occurrences = 0;
    let newContent = currentContent;
    if (useRegex) {
      const regex = new RegExp(oldString, 'g');
      occurrences = (currentContent.match(regex) || []).length;
      newContent = currentContent.replace(regex, newString);
    } else {
      occurrences = currentContent.split(oldString).length - 1;
      newContent = currentContent.replaceAll(oldString, newString);
    }
    return { newContent, occurrences };
  }

  private async calculateEdit(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<CalculatedEdit> {
    const expectedReplacements = params.expected_replacements ?? 1;
    let currentContent: string | null = null;
    let fileExists = false;
    let isNewFile = false;
    let finalOldString = params.old_string;
    let finalNewString = params.new_string;
    let error: { display: string; raw: string; code?: string; suggestions?: string[] } | undefined;
    let occurrences = 0;

    // Check if path is a directory
    try {
      const stats = fs.statSync(params.file_path);
      if (stats.isDirectory()) {
        error = {
          display: `${ErrorMessages.INVALID_FILE_TYPE}: ${params.file_path} is a directory.`,
          raw: `${ErrorMessages.INVALID_FILE_TYPE}: ${params.file_path}`,
          code: 'IS_DIRECTORY',
        };
        return {
          currentContent,
          newContent: '',
          occurrences,
          error,
          isNewFile,
          finalOldString,
          finalNewString,
          originalParams: params,
          timestamp: new Date(),
        };
      }
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        logger.error(`Stat failed for ${params.file_path}: ${err}`);
        throw err;
      }
    }

    // Check cache first
    if (this.fileCache.has(params.file_path)) {
      currentContent = this.fileCache.get(params.file_path)!;
      fileExists = true;
      logger.info(`Using cached content for ${params.file_path}`);
    } else {
      try {
        currentContent = fs.readFileSync(params.file_path, 'utf8').replace(/\r\n/g, '\n');
        this.fileCache.set(params.file_path, currentContent);
        fileExists = true;
      } catch (err: unknown) {
        if (!isNodeError(err) || err.code !== 'ENOENT') {
          logger.error(`Failed to read ${params.file_path}: ${err}`);
          throw err;
        }
      }
    }

    if (params.old_string === '' && !fileExists) {
      isNewFile = true;
      if (params.new_string === '') {
        error = {
          display: 'Cannot create an empty file.',
          raw: 'Attempted to create a new file with empty new_string.',
          code: 'EMPTY_NEW_FILE',
        };
      }
    } else if (params.old_string === '' && fileExists) {
      error = {
        display: `${ErrorMessages.FILE_ALREADY_EXISTS}.`,
        raw: `${ErrorMessages.FILE_ALREADY_EXISTS}: ${params.file_path}`,
        code: 'FILE_EXISTS',
      };
    } else if (!fileExists) {
      error = {
        display: `${ErrorMessages.FILE_NOT_FOUND}. Use empty old_string to create a new file.`,
        raw: `${ErrorMessages.FILE_NOT_FOUND}: ${params.file_path}`,
        code: 'FILE_NOT_FOUND',
      };
    } else if (currentContent !== null) {
      const correctedEdit = await ensureCorrectEdit(currentContent, params, this.client, abortSignal);
      finalOldString = correctedEdit.params.old_string;
      finalNewString = correctedEdit.params.new_string;
      const { newContent, occurrences: calcOccurrences } = this.applyReplacement(
        currentContent,
        finalOldString,
        finalNewString,
        isNewFile,
        params.use_regex ?? false,
      );
      occurrences = calcOccurrences;

      if (occurrences === 0) {
        error = {
          display: `${ErrorMessages.STRING_NOT_FOUND}`,
          raw: `${ErrorMessages.STRING_NOT_FOUND}: 0 occurrences found in ${params.file_path}.`,
          code: 'STRING_NOT_FOUND',
          suggestions: [
            `Use \`${ReadFileTool.Name}\` to inspect the file: \`node read-file.js ${params.file_path}\`.`,
            'Include more context (3+ lines) in old_string.',
            'Check whitespace and indentation.',
            'Set use_regex: true if old_string is a pattern.',
          ],
        };
      } else if (occurrences !== expectedReplacements) {
        const term = expectedReplacements === 1 ? 'occurrence' : 'occurrences';
        error = {
          display: `${ErrorMessages.REPLACEMENT_MISMATCH.replace('{expected}', String(expectedReplacements)).replace('{term}', term).replace('{found}', String(occurrences))}`,
          raw: `${ErrorMessages.REPLACEMENT_MISMATCH.replace('{expected}', String(expectedReplacements)).replace('{term}', term).replace('{found}', String(occurrences))} in ${params.file_path}`,
          code: 'REPLACEMENT_MISMATCH',
          suggestions: [
            `Set expected_replacements: ${occurrences} to replace all matches.`,
            `Refine old_string with more context.`,
            `Run \`${ReadFileTool.Name}\` to view content: \`node read-file.js ${params.file_path}\`.`,
            'Consider use_regex: true for pattern-based replacement.',
          ],
        };
      }
      return {
        currentContent,
        newContent,
        occurrences,
        error,
        isNewFile,
        finalOldString,
        finalNewString,
        originalParams: params,
        timestamp: new Date(),
      };
    } else {
      error = {
        display: `${ErrorMessages.FAILED_TO_READ_CONTENT}`,
        raw: `${ErrorMessages.FAILED_TO_READ_CONTENT}: ${params.file_path}`,
        code: 'READ_ERROR',
      };
    }

    return {
      currentContent,
      newContent: currentContent ?? '',
      occurrences,
      error,
      isNewFile,
      finalOldString,
      finalNewString,
      originalParams: params,
      timestamp: new Date(),
    };
  }

  async shouldConfirmExecute(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (params.dry_run || this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      logger.info('Skipping confirmation due to dry_run or AUTO_EDIT mode');
      return false;
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      logger.error(`Confirmation blocked: ${validationError}`);
      return {
        type: 'error',
        title: 'Validation Error',
        message: validationError,
        outcome: ToolConfirmationOutcome.Cancel,
      };
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params, abortSignal);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Edit calculation failed: ${errorMsg}`);
      return {
        type: 'error',
        title: 'Edit Calculation Error',
        message: `${ErrorMessages.ERROR_PREPARING_EDIT} ${errorMsg}`,
        outcome: ToolConfirmationOutcome.Cancel,
      };
    }

    if (editData.error) {
      logger.warn(`Edit error: ${editData.error.display}`);
      return {
        type: 'error',
        title: 'Edit Error',
        message: editData.error.display,
        suggestions: editData.error.suggestions,
        outcome: ToolConfirmationOutcome.Cancel,
      };
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
    return {
      type: 'edit',
      title: `Confirm Edit: ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`,
      fileName,
      fileDiff,
      description: params.reason ? `Reason: ${params.reason}` : undefined,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
          logger.info('Approval mode set to AUTO_EDIT');
        }
      },
    };
  }

  getDescription(params: EditToolParams): string {
    if (!params.file_path || params.old_string === undefined || params.new_string === undefined) {
      return 'Invalid parameters for edit spell';
    }

    const relativePath = makeRelative(params.file_path, this.rootDirectory);
    if (params.old_string === '' && params.new_string !== '') {
      return `Create ${shortenPath(relativePath)}`;
    }
    if (params.old_string === params.new_string) {
      return `No changes to ${shortenPath(relativePath)}`;
    }

    const snippet = (str: string) => str.split('\n')[0].substring(0, 30) + (str.length > 30 ? '...' : '');
    const regexNote = params.use_regex ? ' (Regex)' : '';
    const dryRunNote = params.dry_run ? ' (Dry Run)' : '';
    return `${shortenPath(relativePath)}: "${snippet(params.old_string)}"${regexNote} => "${snippet(params.new_string)}"${dryRunNote}`;
  }

  async execute(params: EditToolParams, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      logger.error(`Execution failed: ${validationError}`);
      return {
        llmContent: `Error: ${ErrorMessages.INVALID_PARAMETERS} Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    // Permission check - EditTool essentially performs a write operation.
    const permissionService = this.config.getFilePermissionService();
    if (!permissionService.canPerformOperation(params.file_path, 'write')) {
      const relativePath = makeRelative(params.file_path, this.rootDirectory);
      const errorMessage = `Edit (write) operation on file '${shortenPath(relativePath)}' denied by file permission configuration.`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params, signal);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Edit calculation failed: ${errorMsg}`);
      return {
        llmContent: `${ErrorMessages.ERROR_PREPARING_EDIT} ${errorMsg}`,
        returnDisplay: `${ErrorMessages.ERROR_PREPARING_EDIT} ${errorMsg}`,
      };
    }

    if (editData.error) {
      logger.warn(`Edit failed: ${editData.error.raw}`);
      return {
        llmContent: editData.error.raw,
        returnDisplay: {
          message: `Error: ${editData.error.display}`,
          suggestions: editData.error.suggestions,
        },
      };
    }

    if (params.dry_run) {
      const fileName = path.basename(params.file_path);
      const fileDiff = Diff.createPatch(
        fileName,
        editData.currentContent ?? '',
        editData.newContent,
        'Current',
        'Proposed',
        DEFAULT_DIFF_OPTIONS,
      );
      logger.info(`Dry run completed for ${params.file_path}`);
      return {
        llmContent: `Dry run successful for ${params.file_path}. ${editData.occurrences} replacements calculated.`,
        returnDisplay: {
          fileDiff,
          fileName,
          message: `(Dry Run) Proposed ${editData.occurrences} changes for ${shortenPath(
            makeRelative(params.file_path, this.rootDirectory),
          )}. No changes written.`,
        },
      };
    }

    try {
      this.ensureParentDirectoriesExist(params.file_path);
      fs.writeFileSync(params.file_path, editData.newContent, 'utf8');
      this.fileCache.set(params.file_path, editData.newContent); // Update cache

      let displayResult: ToolResultDisplay;
      if (editData.isNewFile) {
        displayResult = `Created ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`;
      } else {
        const fileName = path.basename(params.file_path);
        const fileDiff = Diff.createPatch(
          fileName,
          editData.currentContent ?? '',
          editData.newContent,
          'Current',
          'Proposed',
          DEFAULT_DIFF_OPTIONS,
        );
        displayResult = { fileDiff, fileName };
      }

      const llmSuccessMessageParts = [
        editData.isNewFile
          ? `Created new file: ${params.file_path}`
          : `Modified ${params.file_path} (${editData.occurrences} replacements)`,
      ];
      if (params.modified_by_user) {
        llmSuccessMessageParts.push(`User modified new_string to: "${params.new_string}"`);
      }
      if (params.reason) {
        llmSuccessMessageParts.push(`Reason: "${params.reason}"`);
      }
      if (params.use_regex) {
        llmSuccessMessageParts.push(`Applied regex pattern: "${params.old_string}"`);
      }

      logger.info(`Edit successful: ${llmSuccessMessageParts.join(' ')}`);
      return {
        llmContent: llmSuccessMessageParts.join(' '),
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Write failed for ${params.file_path}: ${errorMsg}`);
      return {
        llmContent: `Error executing edit: ${errorMsg}`,
        returnDisplay: `${ErrorMessages.FAILED_TO_WRITE_FILE}: ${errorMsg}`,
      };
    }
  }

  private ensureParentDirectoriesExist(filePath: string): void {
    const dirName = path.dirname(filePath);
    if (!fs.existsSync(dirName)) {
      try {
        fs.mkdirSync(dirName, { recursive: true });
        logger.info(`Created directories for ${filePath}`);
      } catch (err: unknown) {
        logger.error(`Failed to create directories for ${filePath}: ${err}`);
        throw new Error(`Failed to create directories for ${filePath}: ${err}`);
      }
    }
  }

  getModifyContext(_: AbortSignal): ModifyContext<EditToolParams> {
    return {
      getFilePath: (params: EditToolParams) => params.file_path,
      getCurrentContent: async (params: EditToolParams): Promise<string> => {
        if (this.fileCache.has(params.file_path)) {
          return this.fileCache.get(params.file_path)!;
        }
        try {
          const content = fs.readFileSync(params.file_path, 'utf8').replace(/\r\n/g, '\n');
          this.fileCache.set(params.file_path, content);
          return content;
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') {
            logger.error(`Failed to read ${params.file_path}: ${err}`);
            throw err;
          }
          return '';
        }
      },
      getProposedContent: async (params: EditToolParams): Promise<string> => {
        const content = await this.getModifyContext(_).getCurrentContent(params);
        const isNewFileContext = params.old_string === '' && content === '';
        const { newContent } = this.applyReplacement(
          content,
          params.old_string,
          params.new_string,
          isNewFileContext,
          params.use_regex ?? false,
        );
        return newContent;
      },
      createUpdatedParams: (
        oldContent: string,
        modifiedProposedContent: string,
        originalParams: EditToolParams,
      ): EditToolParams => ({
        ...originalParams,
        old_string: oldContent,
        new_string: modifiedProposedContent,
        modified_by_user: true,
      }),
    };
  }
}