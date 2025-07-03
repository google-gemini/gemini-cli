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
import minimatch from 'minimatch'; // Import minimatch for permission checks

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
  old_string?: string;
  new_string?: string;
  expected_replacements?: number;
  modified_by_user?: boolean;
  reason?: string;
  dry_run?: boolean;
  use_regex?: boolean; // Allow regex for old_string
  line?: number; // Line number for replacement
  delete?: string; // Pattern for line deletion
  append?: string; // Content to append
  insert_after?: string; // Pattern to insert after
  undo?: boolean; // Undo the last edit
  multi_line?: boolean; // Multi-line pattern replacement (handled by use_regex with 's' flag)
  natural_language_query?: string; // Natural language edit command
  batch?: boolean; // Batch edit multiple files
  interactive?: boolean; // Interactive edit with confirmation
  lookbehind?: string; // For advanced regex with context
  lookahead?: string; // For advanced regex with context
  case_insensitive?: boolean; // Perform case-insensitive regex matching
  condition_pattern?: string; // Apply replacement only if this pattern is found
  count?: number; // Limit the number of replacements
}

/**
 * Represents the calculated outcome of an edit operation
 */
interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  occurrences: number;
  error?: {
    display: string;
    raw: string;
    code?: string;
    suggestions?: string[];
  };
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
  FILE_NOT_FOUND: 'File not found.',
  FILE_ALREADY_EXISTS: 'File already exists.',
  STRING_NOT_FOUND: 'Failed to edit, could not find the string to replace.',
  REPLACEMENT_MISMATCH:
    'Failed to edit, expected {expected} {term} but found {found}.',
  INVALID_PARAMETERS: 'Invalid parameters provided.',
  ROOT_DIRECTORY_VIOLATION: 'File path must be within the root directory.',
  ABSOLUTE_PATH_REQUIRED: 'File path must be absolute.',
  FAILED_TO_READ_CONTENT: 'Failed to read content of file.',
  FAILED_TO_WRITE_FILE: 'Error writing file.',
  ERROR_PREPARING_EDIT: 'Error preparing edit:',
  EMPTY_NEW_STRING_ERROR:
    'Cannot replace content with an empty string unless creating a new file.',
  INVALID_FILE_TYPE: 'Target path is not a file or is a directory.',
  REGEX_INVALID: 'Invalid regex pattern provided for old_string.',
  NO_BACKUP_FOUND: 'No backup found for the last edit.',
  PERMISSION_DENIED: 'Operation denied by file permission configuration.',
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
  private lastEditBackup: { filePath: string; content: string } | null = null; // For undo functionality

  constructor(config: Config) {
    super(
      EditTool.Name,
      'Edit',
      `Replaces text within a file in the Termux realm, weaving precision and power. By default, replaces a single occurrence, but can replace multiple with \`expected_replacements\`. Use regex with \`use_regex: true\` for complex patterns. Always summon \`${ReadFileTool.Name}\` to inspect file content first.\n\n      **Parameters**:\n      - \`file_path\`: Absolute path (e.g., /data/data/com.termux/files/home/...).\n      - \`old_string\`: Exact text or regex pattern (if \`use_regex\`) to replace, including 3+ lines of context.\n      - \`new_string\`: Replacement text, preserving code style.\n      - \`expected_replacements\`: Number of replacements (default: 1).\n      - \`use_regex\`: If true, treat \`old_string\` as a regex pattern.\n      - \`reason\`: Purpose of the edit.\n      - \`dry_run\`: If true, preview changes without writing.\n      - \`line\`: Line number for replacement.\n      - \`delete\`: Pattern for line deletion.\n      - \`append\`: Content to append.\n      - \`insert_after\`: Pattern to insert after.\n      - \`undo\`: Undo the last edit.\n      - \`natural_language_query\`: Natural language edit command.\n      - \`batch\`: Batch edit multiple files.\n      - \`interactive\`: Interactive edit with confirmation.\n      - \`lookbehind\`: For advanced regex with context.\n      - \`lookahead\`: For advanced regex with context.\n      - \`case_insensitive\`: Perform case-insensitive regex matching.\n      - \`condition_pattern\`: Apply replacement only if this pattern is found.\n      - \`count\`: Limit the number of replacements.\n\n      **Critical**: \`old_string\` must uniquely match or use regex. Use \`${ReadFileTool.Name}\` to verify content. For new files, set \`old_string\` to empty string.`,
      {
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute path to the file.',
          },
          old_string: {
            type: 'string',
            description: 'Exact text or regex pattern to replace.',
          },
          new_string: { type: 'string', description: 'Replacement text.' },
          expected_replacements: {
            type: 'number',
            description: 'Number of replacements.',
            minimum: 1,
          },
          reason: {
            type: 'string',
            description: 'Purpose of the edit.',
            optional: true,
          },
          dry_run: {
            type: 'boolean',
            description: 'Preview changes without writing.',
            optional: true,
          },
          use_regex: {
            type: 'boolean',
            description: 'Treat old_string as regex.',
            optional: true,
          },
          line: {
            type: 'number',
            description: 'Line number for replacement.',
            optional: true,
          },
          delete: {
            type: 'string',
            description: 'Pattern for line deletion.',
            optional: true,
          },
          append: {
            type: 'string',
            description: 'Content to append.',
            optional: true,
          },
          insert_after: {
            type: 'string',
            description: 'Pattern to insert after.',
            optional: true,
          },
          undo: {
            type: 'boolean',
            description: 'Undo the last edit.',
            optional: true,
          },
          natural_language_query: {
            type: 'string',
            description: 'Natural language edit command.',
            optional: true,
          },
          batch: {
            type: 'boolean',
            description: 'Batch edit multiple files.',
            optional: true,
          },
          interactive: {
            type: 'boolean',
            description: 'Interactive edit with confirmation.',
            optional: true,
          },
          lookbehind: {
            type: 'string',
            description: 'For advanced regex with context.',
            optional: true,
          },
          lookahead: {
            type: 'string',
            description: 'For advanced regex with context.',
            optional: true,
          },
          case_insensitive: {
            type: 'boolean',
            description: 'Perform case-insensitive regex matching.',
            optional: true,
          },
          condition_pattern: {
            type: 'string',
            description: 'Apply replacement only if this pattern is found.',
            optional: true,
          },
          count: {
            type: 'number',
            description: 'Limit the number of replacements.',
            minimum: 1,
            optional: true,
          },
        },
        required: ['file_path'],
        type: 'object',
      },
    );
    this.config = config;
    this.rootDirectory = path.resolve(
      this.config.getTargetDir() || '/data/data/com.termux/files/home',
    );
    this.client = config.getGeminiClient();
    logger.info(`EditTool forged for Termux realm at ${this.rootDirectory}`);
  }

  private isWithinRoot(pathToCheck: string): boolean {
    const normalizedPath = path.normalize(pathToCheck);
    const normalizedRoot = this.rootDirectory;
    const relative = path.relative(normalizedRoot, normalizedPath);
    const isValid = !relative.startsWith('..') && !path.isAbsolute(relative);
    if (!isValid) {
      logger.warn(
        `Path ${pathToCheck} attempts to escape the root ${normalizedRoot}`,
      );
    }
    return isValid;
  }

  private checkFilePermission(
    filePath: string,
    operation: 'read' | 'write',
  ): boolean {
    const rules = this.config.getFilePermissionService().getRules();
    for (const rule of rules) {
      if (minimatch(filePath, rule.pattern)) {
        if (rule.operations.includes(operation)) {
          return rule.effect === 'allow';
        }
      }
    }
    return false; // Default-deny policy
  }

  validateToolParams(params: EditToolParams): string | null {
    if (
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      const errors = SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
        true,
      );
      const errorMsg =
        typeof errors === 'string' ? errors : 'Schema validation failed.';
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

    if (params.use_regex && params.old_string) {
      try {
        new RegExp(params.old_string);
      } catch (err) {
        logger.error(`Invalid regex: ${params.old_string}`);
        return `${ErrorMessages.REGEX_INVALID}: ${String(err)}`;
      }
    }

    // Ensure only one primary edit operation is specified
    const editOperations = [
      params.old_string !== undefined && params.new_string !== undefined,
      params.line !== undefined,
      params.delete !== undefined,
      params.append !== undefined,
      params.insert_after !== undefined,
      params.undo,
      params.natural_language_query !== undefined,
      params.batch,
      params.interactive,
    ].filter(Boolean).length;

    if (editOperations > 1) {
      return `${ErrorMessages.INVALID_PARAMETERS}: Only one primary edit operation (replace, line, delete, append, insert_after, undo, natural_language_query, batch, interactive) can be specified at a time.`;
    }
    if (editOperations === 0 && !params.dry_run) {
      return `${ErrorMessages.INVALID_PARAMETERS}: No edit operation specified.`;
    }

    return null;
  }

  private applyReplacement(
    currentContent: string | null,
    oldString: string,
    newString: string,
    isNewFile: boolean,
    useRegex: boolean = false,
    lookbehind?: string,
    lookahead?: string,
    caseInsensitive: boolean = false,
    count?: number,
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
    let pattern = oldString;

    // Escape lookbehind and lookahead for regex safety
    const escapedLookbehind = lookbehind
      ? lookbehind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : '';
    const escapedLookahead = lookahead
      ? lookahead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : '';

    if (useRegex) {
      let flags = 'gs'; // 'g' for global, 's' for dotAll
      if (caseInsensitive) {
        flags += 'i';
      }

      if (lookbehind) {
        pattern = `(?<=${escapedLookbehind})${pattern}`;
      }
      if (lookahead) {
        pattern = `${pattern}(?=${escapedLookahead})`;
      }
      const regex = new RegExp(pattern, flags);

      if (count !== undefined && count > 0) {
        let match;
        let replacedCount = 0;
        let lastIndex = 0;
        const parts: string[] = [];

        while (
          (match = regex.exec(currentContent)) !== null &&
          replacedCount < count
        ) {
          parts.push(currentContent.substring(lastIndex, match.index));
          parts.push(newString);
          lastIndex = regex.lastIndex;
          replacedCount++;
        }
        parts.push(currentContent.substring(lastIndex));
        newContent = parts.join('');
        occurrences = replacedCount;
      } else {
        occurrences = (currentContent.match(regex) || []).length;
        newContent = currentContent.replace(regex, newString);
      }
    } else {
      if (count !== undefined && count > 0) {
        let replacedCount = 0;
        let lastIndex = 0;
        const parts: string[] = [];
        let currentIndex = 0;

        while (
          replacedCount < count &&
          (currentIndex = currentContent.indexOf(oldString, lastIndex)) !== -1
        ) {
          parts.push(currentContent.substring(lastIndex, currentIndex));
          parts.push(newString);
          lastIndex = currentIndex + oldString.length;
          replacedCount++;
        }
        parts.push(currentContent.substring(lastIndex));
        newContent = parts.join('');
        occurrences = replacedCount;
      } else {
        occurrences = currentContent.split(oldString).length - 1;
        newContent = currentContent.replaceAll(oldString, newString);
      }
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
    let error:
      | { display: string; raw: string; code?: string; suggestions?: string[] }
      | undefined;
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
          finalOldString: finalOldString || '',
          finalNewString: finalNewString || '',
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
        currentContent = fs
          .readFileSync(params.file_path, 'utf8')
          .replace(/\r\n/g, '\n');
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
      if (params.condition_pattern) {
        const conditionRegex = new RegExp(
          params.condition_pattern,
          params.case_insensitive ? 'i' : '',
        );
        if (!conditionRegex.test(currentContent || '')) {
          error = {
            display: `Condition pattern '${params.condition_pattern}' not found in ${params.file_path}. No edit performed.`,
            raw: `Condition pattern '${params.condition_pattern}' not found in ${params.file_path}.`,
            code: 'CONDITION_NOT_MET',
          };
          return {
            currentContent,
            newContent: currentContent ?? '',
            occurrences: 0,
            error,
            isNewFile,
            finalOldString: finalOldString || '',
            finalNewString: finalNewString || '',
            originalParams: params,
            timestamp: new Date(),
          };
        }
      }

      const correctedEdit = await ensureCorrectEdit(
        currentContent,
        params,
        this.client,
        abortSignal,
      );
      finalOldString = correctedEdit.params.old_string;
      finalNewString = correctedEdit.params.new_string;
      const { newContent, occurrences: calcOccurrences } =
        this.applyReplacement(
          currentContent,
          finalOldString || '',
          finalNewString || '',
          isNewFile,
          params.use_regex ?? false,
          params.lookbehind,
          params.lookahead,
          params.case_insensitive ?? false,
          params.count,
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
        finalOldString: finalOldString || '',
        finalNewString: finalNewString || '',
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
      finalOldString: finalOldString || '',
      finalNewString: finalNewString || '',
      originalParams: params,
      timestamp: new Date(),
    };
  }

  async shouldConfirmExecute(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (
      params.dry_run ||
      this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT
    ) {
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
    if (!params.file_path) {
      return 'Invalid parameters for edit spell';
    }

    const relativePath = makeRelative(params.file_path, this.rootDirectory);

    if (params.undo) {
      return `Undo last edit for ${shortenPath(relativePath)}`;
    }
    if (params.natural_language_query) {
      return `Apply natural language edit "${params.natural_language_query}" to ${shortenPath(relativePath)}`;
    }
    if (params.batch) {
      return `Batch edit files matching ${params.file_path}`;
    }
    if (params.interactive) {
      return `Interactive edit for ${shortenPath(relativePath)}`;
    }
    if (params.line !== undefined) {
      return `Replace line ${params.line} in ${shortenPath(relativePath)}`;
    }
    if (params.delete) {
      return `Delete lines matching "${params.delete}" in ${shortenPath(relativePath)}`;
    }
    if (params.append) {
      return `Append to ${shortenPath(relativePath)}`;
    }
    if (params.insert_after) {
      return `Insert after "${params.insert_after}" in ${shortenPath(relativePath)}`;
    }
    if (params.old_string === '' && params.new_string !== '') {
      return `Create ${shortenPath(relativePath)}`;
    }
    if (params.old_string === params.new_string) {
      return `No changes to ${shortenPath(relativePath)}`;
    }

    const snippet = (str: string) =>
      str.split('\n')[0].substring(0, 30) + (str.length > 30 ? '...' : '');
    const regexNote = params.use_regex ? ' (Regex)' : '';
    const dryRunNote = params.dry_run ? ' (Dry Run)' : '';
    const lookbehindNote = params.lookbehind
      ? ` (Lookbehind: "${snippet(params.lookbehind)}")`
      : '';
    const lookaheadNote = params.lookahead
      ? ` (Lookahead: "${snippet(params.lookahead)}")`
      : '';

    return `${shortenPath(relativePath)}: "${snippet(params.old_string || '')}"${regexNote}${lookbehindNote}${lookaheadNote} => "${snippet(params.new_string || '')}"${dryRunNote}`;
  }

  async execute(
    params: EditToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      logger.error(`Execution failed: ${validationError}`);
      return {
        llmContent: `Error: ${ErrorMessages.INVALID_PARAMETERS} Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    // Permission check - EditTool essentially performs a write operation.
    if (!this.checkFilePermission(params.file_path, 'write')) {
      const relativePath = makeRelative(params.file_path, this.rootDirectory);
      const errorMessage = `${ErrorMessages.PERMISSION_DENIED} Edit (write) operation on file '${shortenPath(
        relativePath,
      )}' denied by file permission configuration.`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }

    // Handle undo operation
    if (params.undo) {
      return this.handleUndo(params);
    }

    // Handle natural language query (simple mapping for now, can be expanded with AI)
    if (params.natural_language_query) {
      return this.handleNaturalLanguageEdit(params, signal);
    }

    // Handle batch edit
    if (params.batch) {
      return this.handleBatchEdit(params, signal);
    }

    // Handle interactive edit
    if (params.interactive) {
      return this.handleInteractiveEdit(params, signal);
    }

    // Backup current file content before any modification
    try {
      const currentContent = fs
        .readFileSync(params.file_path, 'utf8')
        .replace(/\n/g, '\n');
      this.lastEditBackup = {
        filePath: params.file_path,
        content: currentContent,
      };
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        // File doesn't exist, no backup needed for new file creation
        this.lastEditBackup = null;
      } else {
        logger.error(
          `Failed to create backup for ${params.file_path}: ${error}`,
        );
        return {
          llmContent: `Error: Failed to create backup for ${params.file_path}: ${error}`,
          returnDisplay: `Error: Failed to create backup for ${params.file_path}: ${error}`,
        };
      }
    }

    if (params.append) {
      try {
        fs.appendFileSync(params.file_path, '\n' + params.append, 'utf8');
        return {
          llmContent: `Appended to ${params.file_path}`,
          returnDisplay: `Appended to ${params.file_path}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Append failed for ${params.file_path}: ${errorMsg}`);
        return {
          llmContent: `Error executing append: ${errorMsg}`,
          returnDisplay: `Error executing append: ${errorMsg}`,
        };
      }
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
      let newContent = editData.newContent;

      if (params.line !== undefined && params.new_string !== undefined) {
        const lines = (editData.currentContent ?? '').split('\n');
        if (params.line <= 0 || params.line > lines.length) {
          throw new Error(`Invalid line number: ${params.line}`);
        }
        lines[params.line - 1] = params.new_string;
        newContent = lines.join('\n');
      } else if (params.delete && editData.currentContent !== null) {
        const lines = editData.currentContent.split('\n');
        const regex = new RegExp(params.delete);
        newContent = lines.filter((line) => !regex.test(line)).join('\n');
      } else if (
        params.insert_after &&
        params.new_string &&
        editData.currentContent !== null
      ) {
        const lines = editData.currentContent.split('\n');
        const regex = new RegExp(params.insert_after);
        const newLines: string[] = [];
        lines.forEach((line) => {
          newLines.push(line);
          if (regex.test(line)) {
            newLines.push(params.new_string);
          }
        });
        newContent = newLines.join('\n');
      }

      fs.writeFileSync(params.file_path, newContent, 'utf8');
      this.fileCache.set(params.file_path, newContent); // Update cache

      let displayResult: ToolResultDisplay;
      if (editData.isNewFile) {
        displayResult = `Created ${shortenPath(
          makeRelative(params.file_path, this.rootDirectory),
        )}`;
      } else {
        const fileName = path.basename(params.file_path);
        const fileDiff = Diff.createPatch(
          fileName,
          editData.currentContent ?? '',
          newContent,
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
        llmSuccessMessageParts.push(
          `User modified new_string to: "${params.new_string}"`,
        );
      }
      if (params.reason) {
        llmSuccessMessageParts.push(`Reason: "${params.reason}"`);
      }
      if (params.use_regex) {
        llmSuccessMessageParts.push(
          `Applied regex pattern: "${params.old_string}"`,
        );
      }
      if (params.line !== undefined) {
        llmSuccessMessageParts.push(`Replaced line ${params.line}`);
      }
      if (params.delete) {
        llmSuccessMessageParts.push(
          `Deleted lines matching "${params.delete}"`,
        );
      }
      if (params.insert_after) {
        llmSuccessMessageParts.push(`Inserted after "${params.insert_after}"`);
      }
      if (params.lookbehind) {
        llmSuccessMessageParts.push(`With lookbehind: "${params.lookbehind}"`);
      }
      if (params.lookahead) {
        llmSuccessMessageParts.push(`With lookahead: "${params.lookahead}"`);
      }
      if (params.case_insensitive) {
        llmSuccessMessageParts.push(`Case-insensitive: true`);
      }
      if (params.condition_pattern) {
        llmSuccessMessageParts.push(
          `Condition pattern: "${params.condition_pattern}"`,
        );
      }
      if (params.count !== undefined) {
        llmSuccessMessageParts.push(
          `Limited to ${params.count} replacement(s)`,
        );
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

  private async handleUndo(params: EditToolParams): Promise<ToolResult> {
    if (
      !this.lastEditBackup ||
      this.lastEditBackup.filePath !== params.file_path
    ) {
      return {
        llmContent: `Error: ${ErrorMessages.NO_BACKUP_FOUND}`,
        returnDisplay: `Error: ${ErrorMessages.NO_BACKUP_FOUND}`,
      };
    }

    try {
      fs.writeFileSync(
        this.lastEditBackup.filePath,
        this.lastEditBackup.content,
        'utf8',
      );
      this.fileCache.set(
        this.lastEditBackup.filePath,
        this.lastEditBackup.content,
      );
      this.lastEditBackup = null; // Clear backup after restore
      return {
        llmContent: `Successfully restored ${this.lastEditBackup.filePath} from backup.`,
        returnDisplay: `Successfully restored ${shortenPath(makeRelative(this.lastEditBackup.filePath, this.rootDirectory))} from backup.`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to undo edit for ${params.file_path}: ${errorMsg}`);
      return {
        llmContent: `Error: Failed to undo edit for ${params.file_path}: ${errorMsg}`,
        returnDisplay: `Error: Failed to undo edit for ${params.file_path}: ${errorMsg}`,
      };
    }
  }

  private async handleNaturalLanguageEdit(
    params: EditToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    // This is a placeholder. In a real scenario, this would involve an AI model
    // to parse the natural_language_query and determine the appropriate
    // old_string, new_string, and use_regex parameters.
    // For now, we'll use a simple hardcoded mapping as per the Python snippet example.
    const editMap: {
      [key: string]: {
        old_pattern: string;
        new_text: string;
        use_regex: boolean;
        lookbehind?: string;
        lookahead?: string;
      };
    } = {
      'fix ta constructor': {
        old_pattern:
          'def __init__\\(self, logger,.*?\\)(.*?)(?=\\n\\s*def|\\n\\s*class|\\Z)',
        new_text:
          "def __init__(self, logger, symbol, timeframe, api_key=None, api_secret=None):\n        self.logger = logger\n        self.symbol = symbol\n        self.timeframe = timeframe\n        self.api_key = api_key\n        this.api_secret = api_secret\n        self.logger.info(f'Initialized TA for {symbol} on {timeframe} timeframe')",
        use_regex: true,
      },
      'fix import': {
        old_pattern: 'from indicators import TMT\\s*(?=\\n)',
        new_text: 'from indicators import TMT, BybitWebSocket',
        use_regex: true,
      },
      // Add more natural language mappings here
    };

    const mappedEdit = editMap[params.natural_language_query!.toLowerCase()];

    if (!mappedEdit) {
      return {
        llmContent: `Error: Natural language query "${params.natural_language_query}" not understood or mapped to an edit operation.`,
        returnDisplay: `Error: Natural language query "${params.natural_language_query}" not understood.`,
      };
    }

    const newParams: EditToolParams = {
      ...params,
      old_string: mappedEdit.old_pattern,
      new_string: mappedEdit.new_text,
      use_regex: mappedEdit.use_regex,
      lookbehind: mappedEdit.lookbehind,
      lookahead: mappedEdit.lookahead,
      natural_language_query: undefined, // Clear to avoid recursion
    };

    // Re-run execute with the mapped parameters
    return this.execute(newParams, signal);
  }

  private async handleBatchEdit(
    params: EditToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    // This assumes file_path in batch mode is a glob pattern for files to edit
    const globPattern = params.file_path;
    const files = fs
      .readdirSync(this.rootDirectory, { recursive: true, withFileTypes: true })
      .filter(
        (dirent) =>
          dirent.isFile() &&
          minimatch(path.join(dirent.path, dirent.name), globPattern),
      )
      .map((dirent) => path.join(this.rootDirectory, dirent.path, dirent.name));

    if (files.length === 0) {
      return {
        llmContent: `No files found matching pattern "${globPattern}" for batch edit.`,
        returnDisplay: `No files found for batch edit.`,
      };
    }

    const results: string[] = [];
    for (const filePath of files) {
      if (!this.checkFilePermission(filePath, 'write')) {
        results.push(
          `Skipped ${shortenPath(makeRelative(filePath, this.rootDirectory))}: Permission denied.`,
        );
        continue;
      }

      const newParams: EditToolParams = {
        ...params,
        file_path: filePath,
        batch: undefined, // Clear to avoid recursion
      };

      try {
        const result = await this.execute(newParams, signal);
        results.push(
          `Processed ${shortenPath(makeRelative(filePath, this.rootDirectory))}: ${result.llmContent}`,
        );
      } catch (error) {
        results.push(
          `Failed to edit ${shortenPath(makeRelative(filePath, this.rootDirectory))}: ${String(error)}`,
        );
      }
    }

    return {
      llmContent: `Batch edit completed. Results:\n${results.join('\n')}`,
      returnDisplay: `Batch edit completed.`,
    };
  }

  private async handleInteractiveEdit(
    params: EditToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    // This will require user interaction, which is not directly supported by the tool execution.
    // Instead, we'll return a message prompting the user to confirm.
    // The actual interactive logic would be handled by the CLI client.

    const editData = await this.calculateEdit(params, signal);

    if (editData.error) {
      return {
        llmContent: editData.error.raw,
        returnDisplay: {
          message: `Error: ${editData.error.display}`,
          suggestions: editData.error.suggestions,
        },
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
      llmContent: `Interactive edit requested for ${params.file_path}. Please review the proposed changes and confirm.`,
      returnDisplay: {
        fileDiff,
        fileName,
        message: `(Interactive Edit) Proposed ${editData.occurrences} changes for ${shortenPath(
          makeRelative(params.file_path, this.rootDirectory),
        )}. Confirm to write changes.`,
        outcome: ToolConfirmationOutcome.Proceed, // Indicate that confirmation is needed
      },
    };
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
          const content = fs
            .readFileSync(params.file_path, 'utf8')
            .replace(/\r\n/g, '\n');
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
        const content =
          await this.getModifyContext(_).getCurrentContent(params);
        const isNewFileContext = params.old_string === '' && content === '';
        const { newContent } = this.applyReplacement(
          content,
          params.old_string || '',
          params.new_string || '',
          isNewFileContext,
          params.use_regex ?? false,
          params.lookbehind,
          params.lookahead,
          params.case_insensitive ?? false,
          params.count,
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
