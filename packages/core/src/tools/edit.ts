/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as Diff from 'diff';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolCallConfirmationDetails,
  type ToolConfirmationOutcome,
  type ToolEditConfirmationDetails,
  type ToolInvocation,
  type ToolLocation,
  type ToolResult,
  type ToolResultDisplay,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ToolErrorType } from './tool-error.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../policy/types.js';
import { CoreToolCallStatus } from '../scheduler/types.js';

import { DEFAULT_DIFF_OPTIONS, getDiffStat } from './diffOptions.js';
import { getDiffContextSnippet } from './diff-utils.js';
import {
  type ModifiableDeclarativeTool,
  type ModifyContext,
} from './modifiable-tool.js';
import { IdeClient } from '../ide/ide-client.js';
import { FixLLMEditWithInstruction } from '../utils/llm-edit-fixer.js';
import { safeLiteralReplace, detectLineEnding } from '../utils/textUtils.js';
import { EditStrategyEvent, EditCorrectionEvent } from '../telemetry/types.js';
import {
  logEditStrategy,
  logEditCorrectionEvent,
} from '../telemetry/loggers.js';

import { correctPath } from '../utils/pathCorrector.js';
import {
  EDIT_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  EDIT_DISPLAY_NAME,
} from './tool-names.js';
import { debugLogger } from '../utils/debugLogger.js';
import levenshtein from 'fast-levenshtein';
import { EDIT_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

const ENABLE_FUZZY_MATCH_RECOVERY = true;
const FUZZY_MATCH_THRESHOLD = 0.1; // Allow up to 10% weighted difference
const WHITESPACE_PENALTY_FACTOR = 0.1; // Whitespace differences cost 10% of a character difference
interface ReplacementContext {
  params: EditToolParams;
  currentContent: string;
  abortSignal: AbortSignal;
}

interface ReplacementResult {
  newContent: string;
  occurrences: number;
  finalOldString: string;
  finalNewString: string;
  strategy?: 'exact' | 'flexible' | 'regex' | 'fuzzy';
  matchRanges?: Array<{ start: number; end: number }>;
}

export function applyReplacement(
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

  // Use intelligent replacement that handles $ sequences safely
  return safeLiteralReplace(currentContent, oldString, newString);
}

/**
 * Creates a SHA256 hash of the given content.
 * @param content The string content to hash.
 * @returns A hex-encoded hash string.
 */
function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function restoreTrailingNewline(
  originalContent: string,
  modifiedContent: string,
): string {
  const hadTrailingNewline = originalContent.endsWith('\n');
  if (hadTrailingNewline && !modifiedContent.endsWith('\n')) {
    return modifiedContent + '\n';
  } else if (!hadTrailingNewline && modifiedContent.endsWith('\n')) {
    return modifiedContent.replace(/\n$/, '');
  }
  return modifiedContent;
}

/**
 * Escapes characters with special meaning in regular expressions.
 * @param str The string to escape.
 * @returns The escaped string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

async function calculateExactReplacement(
  context: ReplacementContext,
): Promise<ReplacementResult | null> {
  const { currentContent, params } = context;
  const { old_string, new_string } = params;

  const normalizedCode = currentContent;
  const normalizedSearch = old_string.replace(/\r\n/g, '\n');
  const normalizedReplace = new_string.replace(/\r\n/g, '\n');

  const exactOccurrences = normalizedCode.split(normalizedSearch).length - 1;
  if (exactOccurrences > 0) {
    let modifiedCode = safeLiteralReplace(
      normalizedCode,
      normalizedSearch,
      normalizedReplace,
    );
    modifiedCode = restoreTrailingNewline(currentContent, modifiedCode);
    return {
      newContent: modifiedCode,
      occurrences: exactOccurrences,
      finalOldString: normalizedSearch,
      finalNewString: normalizedReplace,
    };
  }

  return null;
}

async function calculateFlexibleReplacement(
  context: ReplacementContext,
): Promise<ReplacementResult | null> {
  const { currentContent, params } = context;
  const { old_string, new_string } = params;

  const normalizedCode = currentContent;
  const normalizedSearch = old_string.replace(/\r\n/g, '\n');
  const normalizedReplace = new_string.replace(/\r\n/g, '\n');

  const sourceLines = normalizedCode.match(/.*(?:\n|$)/g)?.slice(0, -1) ?? [];
  const searchLinesStripped = normalizedSearch
    .split('\n')
    .map((line: string) => line.trim());
  const replaceLines = normalizedReplace.split('\n');

  let flexibleOccurrences = 0;
  let i = 0;
  while (i <= sourceLines.length - searchLinesStripped.length) {
    const window = sourceLines.slice(i, i + searchLinesStripped.length);
    const windowStripped = window.map((line: string) => line.trim());
    const isMatch = windowStripped.every(
      (line: string, index: number) => line === searchLinesStripped[index],
    );

    if (isMatch) {
      flexibleOccurrences++;
      const firstLineInMatch = window[0];
      const indentationMatch = firstLineInMatch.match(/^([ \t]*)/);
      const indentation = indentationMatch ? indentationMatch[1] : '';
      const newBlockWithIndent = applyIndentation(replaceLines, indentation);
      sourceLines.splice(
        i,
        searchLinesStripped.length,
        newBlockWithIndent.join('\n'),
      );
      i += replaceLines.length;
    } else {
      i++;
    }
  }

  if (flexibleOccurrences > 0) {
    let modifiedCode = sourceLines.join('');
    modifiedCode = restoreTrailingNewline(currentContent, modifiedCode);
    return {
      newContent: modifiedCode,
      occurrences: flexibleOccurrences,
      finalOldString: normalizedSearch,
      finalNewString: normalizedReplace,
    };
  }

  return null;
}

async function calculateRegexReplacement(
  context: ReplacementContext,
): Promise<ReplacementResult | null> {
  const { currentContent, params } = context;
  const { old_string, new_string } = params;

  // Normalize line endings for consistent processing.
  const normalizedSearch = old_string.replace(/\r\n/g, '\n');
  const normalizedReplace = new_string.replace(/\r\n/g, '\n');

  // This logic is ported from your Python implementation.
  // It builds a flexible, multi-line regex from a search string.
  const delimiters = ['(', ')', ':', '[', ']', '{', '}', '>', '<', '='];

  let processedString = normalizedSearch;
  for (const delim of delimiters) {
    processedString = processedString.split(delim).join(` ${delim} `);
  }

  // Split by any whitespace and remove empty strings.
  const tokens = processedString.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  const escapedTokens = tokens.map(escapeRegex);
  // Join tokens with `\s*` to allow for flexible whitespace between them.
  const pattern = escapedTokens.join('\\s*');

  // The final pattern captures leading whitespace (indentation) and then matches the token pattern.
  // 'm' flag enables multi-line mode, so '^' matches the start of any line.
  const finalPattern = `^([ \t]*)${pattern}`;
  const flexibleRegex = new RegExp(finalPattern, 'm');

  const match = flexibleRegex.exec(currentContent);

  if (!match) {
    return null;
  }

  const indentation = match[1] || '';
  const newLines = normalizedReplace.split('\n');
  const newBlockWithIndent = applyIndentation(newLines, indentation).join('\n');

  // Use replace with the regex to substitute the matched content.
  // Since the regex doesn't have the 'g' flag, it will only replace the first occurrence.
  const modifiedCode = currentContent.replace(
    flexibleRegex,
    newBlockWithIndent,
  );

  return {
    newContent: restoreTrailingNewline(currentContent, modifiedCode),
    occurrences: 1, // This method is designed to find and replace only the first occurrence.
    finalOldString: normalizedSearch,
    finalNewString: normalizedReplace,
  };
}

export async function calculateReplacement(
  config: Config,
  context: ReplacementContext,
): Promise<ReplacementResult> {
  const { currentContent, params } = context;
  const { old_string, new_string } = params;
  const normalizedSearch = old_string.replace(/\r\n/g, '\n');
  const normalizedReplace = new_string.replace(/\r\n/g, '\n');

  if (normalizedSearch === '') {
    return {
      newContent: currentContent,
      occurrences: 0,
      finalOldString: normalizedSearch,
      finalNewString: normalizedReplace,
    };
  }

  const exactResult = await calculateExactReplacement(context);
  if (exactResult) {
    const event = new EditStrategyEvent('exact');
    logEditStrategy(config, event);
    return exactResult;
  }

  const flexibleResult = await calculateFlexibleReplacement(context);
  if (flexibleResult) {
    const event = new EditStrategyEvent('flexible');
    logEditStrategy(config, event);
    return flexibleResult;
  }

  const regexResult = await calculateRegexReplacement(context);
  if (regexResult) {
    const event = new EditStrategyEvent('regex');
    logEditStrategy(config, event);
    return regexResult;
  }

  let fuzzyResult;
  if (
    ENABLE_FUZZY_MATCH_RECOVERY &&
    (fuzzyResult = await calculateFuzzyReplacement(config, context))
  ) {
    return fuzzyResult;
  }

  return {
    newContent: currentContent,
    occurrences: 0,
    finalOldString: normalizedSearch,
    finalNewString: normalizedReplace,
  };
}

export function getErrorReplaceResult(
  params: EditToolParams,
  occurrences: number,
  expectedReplacements: number,
  finalOldString: string,
  finalNewString: string,
) {
  let error: { display: string; raw: string; type: ToolErrorType } | undefined =
    undefined;
  if (occurrences === 0) {
    error = {
      display: `Failed to edit, could not find the string to replace.`,
      raw: `Failed to edit, 0 occurrences found for old_string in ${params.file_path}. Ensure you're not escaping content incorrectly and check whitespace, indentation, and context. Use ${READ_FILE_TOOL_NAME} tool to verify.`,
      type: ToolErrorType.EDIT_NO_OCCURRENCE_FOUND,
    };
  } else if (occurrences !== expectedReplacements) {
    const occurrenceTerm =
      expectedReplacements === 1 ? 'occurrence' : 'occurrences';

    error = {
      display: `Failed to edit, expected ${expectedReplacements} ${occurrenceTerm} but found ${occurrences}.`,
      raw: `Failed to edit, Expected ${expectedReplacements} ${occurrenceTerm} but found ${occurrences} for old_string in file: ${params.file_path}`,
      type: ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH,
    };
  } else if (finalOldString === finalNewString) {
    error = {
      display: `No changes to apply. The old_string and new_string are identical.`,
      raw: `No changes to apply. The old_string and new_string are identical in file: ${params.file_path}`,
      type: ToolErrorType.EDIT_NO_CHANGE,
    };
  }
  return error;
}

/**
 * Parameters for the Edit tool
 */
export interface EditToolParams {
  /**
   * The path to the file to modify
   */
  file_path: string;

  /**
   * The text to replace
   */
  old_string: string;

  /**
   * The text to replace it with
   */
  new_string: string;

  /**
   * Number of replacements expected. Defaults to 1 if not specified.
   * Use when you want to replace multiple occurrences.
   */
  expected_replacements?: number;

  /**
   * The instruction for what needs to be done.
   */
  instruction?: string;

  /**
   * Whether the edit was modified manually by the user.
   */
  modified_by_user?: boolean;

  /**
   * Initially proposed content.
   */
  ai_proposed_content?: string;
}

interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  occurrences: number;
  error?: { display: string; raw: string; type: ToolErrorType };
  isNewFile: boolean;
  originalLineEnding: '\r\n' | '\n';
  strategy?: 'exact' | 'flexible' | 'regex' | 'fuzzy';
  matchRanges?: Array<{ start: number; end: number }>;
}

class EditToolInvocation
  extends BaseToolInvocation<EditToolParams, ToolResult>
  implements ToolInvocation<EditToolParams, ToolResult>
{
  constructor(
    private readonly config: Config,
    params: EditToolParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.params.file_path }];
  }

  private async attemptSelfCorrection(
    params: EditToolParams,
    currentContent: string,
    initialError: { display: string; raw: string; type: ToolErrorType },
    abortSignal: AbortSignal,
    originalLineEnding: '\r\n' | '\n',
  ): Promise<CalculatedEdit> {
    // In order to keep from clobbering edits made outside our system,
    // check if the file has been modified since we first read it.
    let errorForLlmEditFixer = initialError.raw;
    let contentForLlmEditFixer = currentContent;

    const initialContentHash = hashContent(currentContent);
    const onDiskContent = await this.config
      .getFileSystemService()
      .readTextFile(params.file_path);
    const onDiskContentHash = hashContent(onDiskContent.replace(/\r\n/g, '\n'));

    if (initialContentHash !== onDiskContentHash) {
      // The file has changed on disk since we first read it.
      // Use the latest content for the correction attempt.
      contentForLlmEditFixer = onDiskContent.replace(/\r\n/g, '\n');
      errorForLlmEditFixer = `The initial edit attempt failed with the following error: "${initialError.raw}". However, the file has been modified by either the user or an external process since that edit attempt. The file content provided to you is the latest version. Please base your correction on this new content.`;
    }

    const fixedEdit = await FixLLMEditWithInstruction(
      params.instruction ?? 'Apply the requested edit.',
      params.old_string,
      params.new_string,
      errorForLlmEditFixer,
      contentForLlmEditFixer,
      this.config.getBaseLlmClient(),
      abortSignal,
    );

    // If the self-correction attempt timed out, return the original error.
    if (fixedEdit === null) {
      return {
        currentContent: contentForLlmEditFixer,
        newContent: currentContent,
        occurrences: 0,
        isNewFile: false,
        error: initialError,
        originalLineEnding,
      };
    }

    if (fixedEdit.noChangesRequired) {
      return {
        currentContent,
        newContent: currentContent,
        occurrences: 0,
        isNewFile: false,
        error: {
          display: `No changes required. The file already meets the specified conditions.`,
          raw: `A secondary check by an LLM determined that no changes were necessary to fulfill the instruction. Explanation: ${fixedEdit.explanation}. Original error with the parameters given: ${initialError.raw}`,
          type: ToolErrorType.EDIT_NO_CHANGE_LLM_JUDGEMENT,
        },
        originalLineEnding,
      };
    }

    const secondAttemptResult = await calculateReplacement(this.config, {
      params: {
        ...params,
        old_string: fixedEdit.search,
        new_string: fixedEdit.replace,
      },
      currentContent: contentForLlmEditFixer,
      abortSignal,
    });

    const secondError = getErrorReplaceResult(
      params,
      secondAttemptResult.occurrences,
      params.expected_replacements ?? 1,
      secondAttemptResult.finalOldString,
      secondAttemptResult.finalNewString,
    );

    if (secondError) {
      // The fix failed, log failure and return the original error
      const event = new EditCorrectionEvent('failure');
      logEditCorrectionEvent(this.config, event);

      return {
        currentContent: contentForLlmEditFixer,
        newContent: currentContent,
        occurrences: 0,
        isNewFile: false,
        error: initialError,
        originalLineEnding,
      };
    }

    const event = new EditCorrectionEvent(CoreToolCallStatus.Success);
    logEditCorrectionEvent(this.config, event);

    return {
      currentContent: contentForLlmEditFixer,
      newContent: secondAttemptResult.newContent,
      occurrences: secondAttemptResult.occurrences,
      isNewFile: false,
      error: undefined,
      originalLineEnding,
      strategy: secondAttemptResult.strategy,
      matchRanges: secondAttemptResult.matchRanges,
    };
  }

  /**
   * Calculates the potential outcome of an edit operation.
   * @param params Parameters for the edit operation
   * @returns An object describing the potential edit outcome
   * @throws File system errors if reading the file fails unexpectedly (e.g., permissions)
   */
  private async calculateEdit(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<CalculatedEdit> {
    const expectedReplacements = params.expected_replacements ?? 1;
    let currentContent: string | null = null;
    let fileExists = false;
    let originalLineEnding: '\r\n' | '\n' = '\n'; // Default for new files

    try {
      currentContent = await this.config
        .getFileSystemService()
        .readTextFile(params.file_path);
      originalLineEnding = detectLineEnding(currentContent);
      currentContent = currentContent.replace(/\r\n/g, '\n');
      fileExists = true;
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        throw err;
      }
      fileExists = false;
    }

    const isNewFile = params.old_string === '' && !fileExists;

    if (isNewFile) {
      return {
        currentContent,
        newContent: params.new_string,
        occurrences: 1,
        isNewFile: true,
        error: undefined,
        originalLineEnding,
      };
    }

    // after this point, it's not a new file/edit
    if (!fileExists) {
      return {
        currentContent,
        newContent: '',
        occurrences: 0,
        isNewFile: false,
        error: {
          display: `File not found. Cannot apply edit. Use an empty old_string to create a new file.`,
          raw: `File not found: ${params.file_path}`,
          type: ToolErrorType.FILE_NOT_FOUND,
        },
        originalLineEnding,
      };
    }

    if (currentContent === null) {
      return {
        currentContent,
        newContent: '',
        occurrences: 0,
        isNewFile: false,
        error: {
          display: `Failed to read content of file.`,
          raw: `Failed to read content of existing file: ${params.file_path}`,
          type: ToolErrorType.READ_CONTENT_FAILURE,
        },
        originalLineEnding,
      };
    }

    if (params.old_string === '') {
      return {
        currentContent,
        newContent: currentContent,
        occurrences: 0,
        isNewFile: false,
        error: {
          display: `Failed to edit. Attempted to create a file that already exists.`,
          raw: `File already exists, cannot create: ${params.file_path}`,
          type: ToolErrorType.ATTEMPT_TO_CREATE_EXISTING_FILE,
        },
        originalLineEnding,
      };
    }

    const replacementResult = await calculateReplacement(this.config, {
      params,
      currentContent,
      abortSignal,
    });

    const initialError = getErrorReplaceResult(
      params,
      replacementResult.occurrences,
      expectedReplacements,
      replacementResult.finalOldString,
      replacementResult.finalNewString,
    );

    if (!initialError) {
      return {
        currentContent,
        newContent: replacementResult.newContent,
        occurrences: replacementResult.occurrences,
        isNewFile: false,
        error: undefined,
        originalLineEnding,
        strategy: replacementResult.strategy,
        matchRanges: replacementResult.matchRanges,
      };
    }

    if (this.config.getDisableLLMCorrection()) {
      return {
        currentContent,
        newContent: currentContent,
        occurrences: replacementResult.occurrences,
        isNewFile: false,
        error: initialError,
        originalLineEnding,
      };
    }

    // If there was an error, try to self-correct.
    return this.attemptSelfCorrection(
      params,
      currentContent,
      initialError,
      abortSignal,
      originalLineEnding,
    );
  }

  /**
   * Handles the confirmation prompt for the Edit tool in the CLI.
   * It needs to calculate the diff to show the user.
   */
  protected override async getConfirmationDetails(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(this.params, abortSignal);
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugLogger.log(`Error preparing edit: ${errorMsg}`);
      return false;
    }

    if (editData.error) {
      debugLogger.log(`Error: ${editData.error.display}`);
      return false;
    }

    const fileName = path.basename(this.params.file_path);
    const fileDiff = Diff.createPatch(
      fileName,
      editData.currentContent ?? '',
      editData.newContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );
    const ideClient = await IdeClient.getInstance();
    const ideConfirmation =
      this.config.getIdeMode() && ideClient.isDiffingEnabled()
        ? ideClient.openDiff(this.params.file_path, editData.newContent)
        : undefined;

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Edit: ${shortenPath(makeRelative(this.params.file_path, this.config.getTargetDir()))}`,
      fileName,
      filePath: this.params.file_path,
      fileDiff,
      originalContent: editData.currentContent,
      newContent: editData.newContent,
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {
        // Mode transitions (e.g. AUTO_EDIT) and policy updates are now
        // handled centrally by the scheduler.

        if (ideConfirmation) {
          const result = await ideConfirmation;
          if (result.status === 'accepted' && result.content) {
            // TODO(chrstn): See https://github.com/google-gemini/gemini-cli/pull/5618#discussion_r2255413084
            // for info on a possible race condition where the file is modified on disk while being edited.
            this.params.old_string = editData.currentContent ?? '';
            this.params.new_string = result.content;
          }
        }
      },
      ideConfirmation,
    };
    return confirmationDetails;
  }

  getDescription(): string {
    const relativePath = makeRelative(
      this.params.file_path,
      this.config.getTargetDir(),
    );
    if (this.params.old_string === '') {
      return `Create ${shortenPath(relativePath)}`;
    }

    const oldStringSnippet =
      this.params.old_string.split('\n')[0].substring(0, 30) +
      (this.params.old_string.length > 30 ? '...' : '');
    const newStringSnippet =
      this.params.new_string.split('\n')[0].substring(0, 30) +
      (this.params.new_string.length > 30 ? '...' : '');

    if (this.params.old_string === this.params.new_string) {
      return `No file changes to ${shortenPath(relativePath)}`;
    }
    return `${shortenPath(relativePath)}: ${oldStringSnippet} => ${newStringSnippet}`;
  }

  /**
   * Executes the edit operation with the given parameters.
   * @param params Parameters for the edit operation
   * @returns Result of the edit operation
   */
  async execute(signal: AbortSignal): Promise<ToolResult> {
    const resolvedPath = path.resolve(
      this.config.getTargetDir(),
      this.params.file_path,
    );
    const validationError = this.config.validatePathAccess(resolvedPath);
    if (validationError) {
      return {
        llmContent: validationError,
        returnDisplay: 'Error: Path not in workspace.',
        error: {
          message: validationError,
          type: ToolErrorType.PATH_NOT_IN_WORKSPACE,
        },
      };
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(this.params, signal);
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
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
      await this.ensureParentDirectoriesExistAsync(this.params.file_path);
      let finalContent = editData.newContent;

      // Restore original line endings if they were CRLF, or use OS default for new files
      const useCRLF =
        (!editData.isNewFile && editData.originalLineEnding === '\r\n') ||
        (editData.isNewFile && os.EOL === '\r\n');

      if (useCRLF) {
        finalContent = finalContent.replace(/\r?\n/g, '\r\n');
      }
      await this.config
        .getFileSystemService()
        .writeTextFile(this.params.file_path, finalContent);

      let displayResult: ToolResultDisplay;
      if (editData.isNewFile) {
        displayResult = `Created ${shortenPath(makeRelative(this.params.file_path, this.config.getTargetDir()))}`;
      } else {
        // Generate diff for display, even though core logic doesn't technically need it
        // The CLI wrapper will use this part of the ToolResult
        const fileName = path.basename(this.params.file_path);
        const fileDiff = Diff.createPatch(
          fileName,
          editData.currentContent ?? '', // Should not be null here if not isNewFile
          editData.newContent,
          'Current',
          'Proposed',
          DEFAULT_DIFF_OPTIONS,
        );

        const diffStat = getDiffStat(
          fileName,
          editData.currentContent ?? '',
          editData.newContent,
          this.params.new_string,
        );
        displayResult = {
          fileDiff,
          fileName,
          filePath: this.params.file_path,
          originalContent: editData.currentContent,
          newContent: editData.newContent,
          diffStat,
          isNewFile: editData.isNewFile,
        };
      }

      const llmSuccessMessageParts = [
        editData.isNewFile
          ? `Created new file: ${this.params.file_path} with provided content.`
          : `Successfully modified file: ${this.params.file_path} (${editData.occurrences} replacements).`,
      ];

      // Return a diff of the file before and after the write so that the agent
      // can avoid the need to spend a turn doing a verification read.
      const snippet = getDiffContextSnippet(
        editData.currentContent ?? '',
        finalContent,
        5,
      );
      llmSuccessMessageParts.push(`Here is the updated code:
${snippet}`);
      const fuzzyFeedback = getFuzzyMatchFeedback(editData);
      if (fuzzyFeedback) {
        llmSuccessMessageParts.push(fuzzyFeedback);
      }
      if (this.params.modified_by_user) {
        llmSuccessMessageParts.push(
          `User modified the \`new_string\` content to be: ${this.params.new_string}.`,
        );
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

  /**
   * Creates parent directories if they don't exist
   */
  private async ensureParentDirectoriesExistAsync(
    filePath: string,
  ): Promise<void> {
    const dirName = path.dirname(filePath);
    try {
      await fsPromises.access(dirName);
    } catch {
      await fsPromises.mkdir(dirName, { recursive: true });
    }
  }
}

/**
 * Implementation of the Edit tool logic
 */
export class EditTool
  extends BaseDeclarativeTool<EditToolParams, ToolResult>
  implements ModifiableDeclarativeTool<EditToolParams>
{
  static readonly Name = EDIT_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      EditTool.Name,
      EDIT_DISPLAY_NAME,
      EDIT_DEFINITION.base.description!,
      Kind.Edit,
      EDIT_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  /**
   * Validates the parameters for the Edit tool
   * @param params Parameters to validate
   * @returns Error message string or null if valid
   */
  protected override validateToolParamValues(
    params: EditToolParams,
  ): string | null {
    if (!params.file_path) {
      return "The 'file_path' parameter must be non-empty.";
    }

    let filePath = params.file_path;
    if (!path.isAbsolute(filePath)) {
      // Attempt to auto-correct to an absolute path
      const result = correctPath(filePath, this.config);
      if (!result.success) {
        return result.error;
      }
      filePath = result.correctedPath;
    }
    params.file_path = filePath;

    return this.config.validatePathAccess(params.file_path);
  }

  protected createInvocation(
    params: EditToolParams,
    messageBus: MessageBus,
  ): ToolInvocation<EditToolParams, ToolResult> {
    return new EditToolInvocation(
      this.config,
      params,
      messageBus,
      this.name,
      this.displayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(EDIT_DEFINITION, modelId);
  }

  getModifyContext(_: AbortSignal): ModifyContext<EditToolParams> {
    return {
      getFilePath: (params: EditToolParams) => params.file_path,
      getCurrentContent: async (params: EditToolParams): Promise<string> => {
        try {
          return await this.config
            .getFileSystemService()
            .readTextFile(params.file_path);
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      getProposedContent: async (params: EditToolParams): Promise<string> => {
        try {
          const currentContent = await this.config
            .getFileSystemService()
            .readTextFile(params.file_path);
          return applyReplacement(
            currentContent,
            params.old_string,
            params.new_string,
            params.old_string === '' && currentContent === '',
          );
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      createUpdatedParams: (
        oldContent: string,
        modifiedProposedContent: string,
        originalParams: EditToolParams,
      ): EditToolParams => {
        const content = originalParams.new_string;
        return {
          ...originalParams,
          ai_proposed_content: content,
          old_string: oldContent,
          new_string: modifiedProposedContent,
          modified_by_user: true,
        };
      },
    };
  }
}

function stripWhitespace(str: string): string {
  return str.replace(/\s/g, '');
}

/**
 * Applies the target indentation to the lines, while preserving relative indentation.
 * It identifies the common indentation of the provided lines and replaces it with the target indentation.
 */
function applyIndentation(
  lines: string[],
  targetIndentation: string,
): string[] {
  if (lines.length === 0) return [];

  // Use the first line as the reference for indentation, even if it's empty/whitespace.
  // This is because flexible/fuzzy matching identifies the indentation of the START of the match.
  const referenceLine = lines[0];
  const refIndentMatch = referenceLine.match(/^([ \t]*)/);
  const refIndent = refIndentMatch ? refIndentMatch[1] : '';

  return lines.map((line) => {
    if (line.trim() === '') {
      return '';
    }
    if (line.startsWith(refIndent)) {
      return targetIndentation + line.slice(refIndent.length);
    }
    return targetIndentation + line.trimStart();
  });
}

function getFuzzyMatchFeedback(editData: CalculatedEdit): string | null {
  if (
    editData.strategy === 'fuzzy' &&
    editData.matchRanges &&
    editData.matchRanges.length > 0
  ) {
    const ranges = editData.matchRanges
      .map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`))
      .join(', ');
    return `Applied fuzzy match at line${editData.matchRanges.length > 1 ? 's' : ''} ${ranges}.`;
  }
  return null;
}

async function calculateFuzzyReplacement(
  config: Config,
  context: ReplacementContext,
): Promise<ReplacementResult | null> {
  const { currentContent, params } = context;
  const { old_string, new_string } = params;

  // Pre-check: Don't fuzzy match very short strings to avoid false positives
  if (old_string.length < 10) {
    return null;
  }

  const normalizedCode = currentContent.replace(/\r\n/g, '\n');
  const normalizedSearch = old_string.replace(/\r\n/g, '\n');
  const normalizedReplace = new_string.replace(/\r\n/g, '\n');

  const sourceLines = normalizedCode.match(/.*(?:\n|$)/g)?.slice(0, -1) ?? [];
  const searchLines = normalizedSearch
    .match(/.*(?:\n|$)/g)
    ?.slice(0, -1)
    .map((l) => l.trimEnd()); // Trim end of search lines to be more robust

  // Limit the scope of the fuzzy match to reduce impact on responsivesness.
  // Each comparison takes roughly O(L^2) time.
  // We perform sourceLines.length comparisons (sliding window).
  // Total complexity proxy: sourceLines.length * old_string.length^2
  // Limit to 4e8 for < 1 second.
  if (sourceLines.length * Math.pow(old_string.length, 2) > 400_000_000) {
    return null;
  }

  if (!searchLines || searchLines.length === 0) {
    return null;
  }

  const N = searchLines.length;
  const candidates: Array<{ index: number; score: number }> = [];
  const searchBlock = searchLines.join('\n');

  // Sliding window
  for (let i = 0; i <= sourceLines.length - N; i++) {
    const windowLines = sourceLines.slice(i, i + N);
    const windowText = windowLines.map((l) => l.trimEnd()).join('\n'); // Normalized join for comparison

    // Length Heuristic Optimization
    const lengthDiff = Math.abs(windowText.length - searchBlock.length);
    if (
      lengthDiff / searchBlock.length >
      FUZZY_MATCH_THRESHOLD / WHITESPACE_PENALTY_FACTOR
    ) {
      continue;
    }

    // Tiered Scoring
    const d_raw = levenshtein.get(windowText, searchBlock);
    const d_norm = levenshtein.get(
      stripWhitespace(windowText),
      stripWhitespace(searchBlock),
    );

    const weightedDist = d_norm + (d_raw - d_norm) * WHITESPACE_PENALTY_FACTOR;
    const score = weightedDist / searchBlock.length;

    if (score <= FUZZY_MATCH_THRESHOLD) {
      candidates.push({ index: i, score });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Select best non-overlapping matches
  // Sort by score ascending. If scores equal, prefer earlier index (stable sort).
  candidates.sort((a, b) => a.score - b.score || a.index - b.index);

  const selectedMatches: Array<{ index: number; score: number }> = [];
  for (const candidate of candidates) {
    // Check for overlap with already selected matches
    // Two windows overlap if their start indices are within N lines of each other
    // (Assuming window size N. Actually overlap is |i - j| < N)
    const overlaps = selectedMatches.some(
      (m) => Math.abs(m.index - candidate.index) < N,
    );
    if (!overlaps) {
      selectedMatches.push(candidate);
    }
  }

  // If we found matches, apply them
  if (selectedMatches.length > 0) {
    const event = new EditStrategyEvent('fuzzy');
    logEditStrategy(config, event);

    // Calculate match ranges before sorting for replacement
    // Indices in selectedMatches are 0-based line indices
    const matchRanges = selectedMatches
      .map((m) => ({ start: m.index + 1, end: m.index + N }))
      .sort((a, b) => a.start - b.start);

    // Sort matches by index descending to apply replacements from bottom to top
    // so that indices remain valid
    selectedMatches.sort((a, b) => b.index - a.index);

    const newLines = normalizedReplace.split('\n');

    for (const match of selectedMatches) {
      // If we want to preserve the indentation of the first line of the match:
      const firstLineMatch = sourceLines[match.index];
      const indentationMatch = firstLineMatch.match(/^([ \t]*)/);
      const indentation = indentationMatch ? indentationMatch[1] : '';

      const indentedReplaceLines = applyIndentation(newLines, indentation);

      let replacementText = indentedReplaceLines.join('\n');
      // If the last line of the match had a newline, preserve it in the replacement
      // to avoid merging with the next line or losing a blank line separator.
      if (sourceLines[match.index + N - 1].endsWith('\n')) {
        replacementText += '\n';
      }

      sourceLines.splice(match.index, N, replacementText);
    }

    let modifiedCode = sourceLines.join('');
    modifiedCode = restoreTrailingNewline(currentContent, modifiedCode);

    return {
      newContent: modifiedCode,
      occurrences: selectedMatches.length,
      finalOldString: normalizedSearch,
      finalNewString: normalizedReplace,
      strategy: 'fuzzy',
      matchRanges,
    };
  }

  return null;
}
