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
import levenshtein from 'fast-levenshtein';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
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

import { DEFAULT_DIFF_OPTIONS, getDiffStat } from './diffOptions.js';
import {
  type ModifiableDeclarativeTool,
  type ModifyContext,
} from './modifiable-tool.js';
import { IdeClient } from '../ide/ide-client.js';
import { FixLLMEditWithInstruction } from '../utils/llm-edit-fixer.js';
import { safeLiteralReplace, detectLineEnding } from '../utils/textUtils.js';
import { EditStrategyEvent } from '../telemetry/types.js';
import { logEditStrategy } from '../telemetry/loggers.js';
import { EditCorrectionEvent } from '../telemetry/types.js';
import { logEditCorrectionEvent } from '../telemetry/loggers.js';

import { correctPath } from '../utils/pathCorrector.js';
import { EDIT_TOOL_NAME, READ_FILE_TOOL_NAME } from './tool-names.js';
import { debugLogger } from '../utils/debugLogger.js';

// Threshold for fuzzy matching (0.0 to 1.0, where 1.0 is exact match)
// Lowered to 0.80 to handle intra-line whitespace differences better (like Aider)
const FUZZY_MATCH_THRESHOLD = 0.8;

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
 * Calculates the similarity ratio between two strings using Levenshtein distance.
 * @returns A number between 0 and 1, where 1 is identical.
 */
function calculateSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const distance = levenshtein.get(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  if (maxLength === 0) return 1.0;
  return 1 - distance / maxLength;
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

interface FuzzyMatch {
  index: number;
  score: number;
  content: string; // The original content of the matched window
}

async function calculateFuzzyReplacement(
  context: ReplacementContext,
): Promise<ReplacementResult | null> {
  const { currentContent, params } = context;
  const { old_string, new_string } = params;

  const normalizedCode = currentContent;
  const searchBlock = old_string.replace(/\r\n/g, '\n');
  const replaceBlock = new_string.replace(/\r\n/g, '\n');

  const fileLines = normalizedCode.split('\n');
  const searchLines = searchBlock.split('\n');

  // Use trimmed lines for similarity to handle indentation differences
  const searchLinesTrimmed = searchLines.map((l) => l.trim());
  const searchBlockTrimmed = searchLinesTrimmed.join('\n');

  if (searchLines.length === 0 || fileLines.length < searchLines.length) {
    return null;
  }

  // Optimization: Pre-calculate the first line of the search block for heuristic check
  const firstSearchLineTrimmed = searchLinesTrimmed[0];

  const startIndex = 0;
  const maxIndex = fileLines.length - searchLines.length;

  const matches: FuzzyMatch[] = [];

  for (let i = startIndex; i <= maxIndex; i++) {
    // Heuristic: Check if the first line matches somewhat before computing full Levenshtein
    if (searchLines.length > 0) {
      const currentFirstLineTrimmed = fileLines[i].trim();
      if (currentFirstLineTrimmed !== firstSearchLineTrimmed) {
        if (
          calculateSimilarity(currentFirstLineTrimmed, firstSearchLineTrimmed) <
          0.6
        ) {
          continue;
        }
      }
    }

    const windowLines = fileLines.slice(i, i + searchLines.length);
    const windowContentTrimmed = windowLines.map((l) => l.trim()).join('\n');

    const score = calculateSimilarity(windowContentTrimmed, searchBlockTrimmed);

    if (score >= FUZZY_MATCH_THRESHOLD) {
      // Check for overlap with the previous match
      const prevMatch = matches[matches.length - 1];

      // Overlap condition: current index `i` is within the range of previous match [prev.index, prev.index + length)
      if (prevMatch && i < prevMatch.index + searchLines.length) {
        if (score > prevMatch.score) {
          // This match is better than the previous overlapping one, replace it
          matches[matches.length - 1] = {
            index: i,
            score,
            content: windowLines.join('\n'),
          };
        }
        // If score <= prevMatch.score, we ignore this one (greedy approach for best local match)
      } else {
        // No overlap, add as new match
        matches.push({
          index: i,
          score,
          content: windowLines.join('\n'),
        });
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // Apply replacements from bottom to top to preserve indices
  // Matches should already be sorted by index ascending, so reverse them
  const matchesToReplace = matches.reverse();

  // We need to accumulate the new file lines
  // Since we are operating on `fileLines` array, we can use splicing if we work backwards
  // Or just reconstruct the array.

  const finalFileLines = [...fileLines];
  let finalOldString = ''; // For reporting, if multiple, this might be ambiguous. We'll use the first one found (last in reverse list) or all?
  // The tool interface expects `finalOldString` to be "the exact literal text".
  // If we replaced multiple different fuzzy matches, this is tricky.
  // We will return the content of the *first* match found (top of file) for reporting purposes, or join them?
  // Usually `finalOldString` is used to verify if change happened.
  // We'll use the content of the best match (highest score) or just the first one.

  // Let's collect all replaced contents for `finalOldString` if needed, but usually just one is expected for display?
  // We'll concatenate them with newlines if multiple? No that breaks diff.
  // We'll return the original search block if multiple, or the actual match if single.
  // Let's stick to the content of the first match (matches[0] before reverse).
  finalOldString = matches[0].content;

  for (const match of matchesToReplace) {
    const matchedLines = finalFileLines.slice(
      match.index,
      match.index + searchLines.length,
    );

    // Calculate indentation for this specific match
    const matchedFirstLine = matchedLines[0];
    const matchIndentMatch = matchedFirstLine.match(/^(\s*)/);
    const matchIndent = matchIndentMatch ? matchIndentMatch[1] : '';

    const searchIndentMatch = searchLines[0].match(/^(\s*)/);
    const searchIndent = searchIndentMatch ? searchIndentMatch[1] : '';

    const replaceLines = replaceBlock.split('\n');
    const finalReplaceLines = replaceLines.map((line) => {
      if (line.trim() === '') return '';
      if (searchIndent === '' && matchIndent !== '') {
        return matchIndent + line;
      }
      return line;
    });

    // Replace lines in the array
    finalFileLines.splice(
      match.index,
      searchLines.length,
      ...finalReplaceLines,
    );
  }

  let modifiedCode = finalFileLines.join('\n');
  modifiedCode = restoreTrailingNewline(currentContent, modifiedCode);

  return {
    newContent: modifiedCode,
    occurrences: matches.length,
    finalOldString, // Return the content of the first match found
    finalNewString: replaceBlock, // This is technically slightly inaccurate if we indented it multiple times differently
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

  // 1. Exact Match
  const exactResult = await calculateExactReplacement(context);
  if (exactResult) {
    const event = new EditStrategyEvent('exact');
    logEditStrategy(config, event);
    return exactResult;
  }

  // 2. Fuzzy Match (includes flexible whitespace matching)
  // This replaces the old 'flexible' and 'regex' strategies with a more robust Aider-like approach
  const fuzzyResult = await calculateFuzzyReplacement(context);
  if (fuzzyResult) {
    const event = new EditStrategyEvent('fuzzy');
    logEditStrategy(config, event);
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

    const event = new EditCorrectionEvent('success');
    logEditCorrectionEvent(this.config, event);

    return {
      currentContent: contentForLlmEditFixer,
      newContent: secondAttemptResult.newContent,
      occurrences: secondAttemptResult.occurrences,
      isNewFile: false,
      error: undefined,
      originalLineEnding,
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
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          // No need to publish a policy update as the default policy for
          // AUTO_EDIT already reflects always approving edit.
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        } else {
          await this.publishPolicyUpdate(outcome);
        }

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

      let llmContent: string;
      if (editData.isNewFile) {
        llmContent = `Created new file: ${this.params.file_path} with provided content.`;
      } else {
        const diff = Diff.diffLines(
          editData.currentContent ?? '',
          editData.newContent,
        );
        const newLines = editData.newContent.split('\n');

        let currentLine = 0;
        let firstChange = -1;
        let lastChange = -1;

        for (const part of diff) {
          if (part.added || part.removed) {
            if (firstChange === -1) firstChange = currentLine;
            if (part.added) {
              currentLine += part.count ?? 0;
              lastChange = currentLine - 1;
            } else {
              lastChange = Math.max(lastChange, currentLine - 1);
            }
          } else {
            currentLine += part.count ?? 0;
          }
        }

        if (firstChange === -1) {
          llmContent = `Successfully modified file: ${this.params.file_path} (${editData.occurrences} replacements).`;
        } else {
          if (lastChange < firstChange) lastChange = firstChange;

          const start = Math.max(0, firstChange - 5);
          const end = Math.min(newLines.length - 1, lastChange + 15);

          const contextLines = newLines.slice(start, end + 1);
          const contextText = contextLines.join('\n');

          llmContent = `SUCCESS: Modified ${this.params.file_path}.
Showing updated context (lines ${start + 1}-${end + 1}):

${contextText}

NOTE: Line numbers in the rest of the file may have shifted.
Refer to the context above for updated positioning.`;
        }
      }

      if (this.params.modified_by_user) {
        llmContent += `\n\nUser modified the \`new_string\` content to be: ${this.params.new_string}.`;
      }

      return {
        llmContent,
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
      'Edit',
      `Replaces text within a file. By default, replaces a single occurrence, but can replace multiple occurrences when \`expected_replacements\` is specified. This tool requires providing significant context around the change to ensure precise targeting. Always use the ${READ_FILE_TOOL_NAME} tool (using 'offset' and 'limit' to get enough lines of context around the match) to examine the file's current content before attempting a text replacement.
      
      The user has the ability to modify the \`new_string\` content. If modified, this will be stated in the response.
      
      Expectation for required parameters:
      1. \`old_string\` MUST be the exact literal text to replace (including all whitespace, indentation, newlines, and surrounding code etc.).
      2. \`new_string\` MUST be the exact literal text to replace \`old_string\` with (also including all whitespace, indentation, newlines, and surrounding code etc.). Ensure the resulting code is correct and idiomatic and that \`old_string\` and \`new_string\` are different.
      3. \`instruction\` is the detailed instruction of what needs to be changed. It is important to Make it specific and detailed so developers or large language models can understand what needs to be changed and perform the changes on their own if necessary. 
      4. NEVER escape \`old_string\` or \`new_string\`, that would break the exact literal text requirement.
      **Important:** If ANY of the above are not satisfied, the tool will fail. CRITICAL for \`old_string\`: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations, or does not match exactly, the tool will fail.
      5. Prefer to break down complex and long changes into multiple smaller atomic calls to this tool. Always check the content of the file after changes or not finding a string to match.
      **Multiple replacements:** Set \`expected_replacements\` to the number of occurrences you want to replace. The tool will replace ALL occurrences that match \`old_string\` exactly. Ensure the number of replacements matches your expectation.`,
      Kind.Edit,
      {
        properties: {
          file_path: {
            description: 'The path to the file to modify.',
            type: 'string',
          },
          instruction: {
            description: `A clear, semantic instruction for the code change, acting as a high-quality prompt for an expert LLM assistant. It must be self-contained and explain the goal of the change.

A good instruction should concisely answer:
1.  WHY is the change needed? (e.g., "To fix a bug where users can be null...")
2.  WHERE should the change happen? (e.g., "...in the 'renderUserProfile' function...")
3.  WHAT is the high-level change? (e.g., "...add a null check for the 'user' object...")
4.  WHAT is the desired outcome? (e.g., "...so that it displays a loading spinner instead of crashing.")

**GOOD Example:** "In the 'calculateTotal' function, correct the sales tax calculation by updating the 'taxRate' constant from 0.05 to 0.075 to reflect the new regional tax laws."

**BAD Examples:**
- "Change the text." (Too vague)
- "Fix the bug." (Doesn't explain the bug or the fix)
- "Replace the line with this new line." (Brittle, just repeats the other parameters)
`,
            type: 'string',
          },
          old_string: {
            description:
              'The exact literal text to replace, preferably unescaped. For single replacements (default), include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string is not the exact literal text (i.e. you escaped it) or does not match exactly, the tool will fail.',
            type: 'string',
          },
          new_string: {
            description:
              'The exact literal text to replace `old_string` with, preferably unescaped. Provide the EXACT text. Ensure the resulting code is correct and idiomatic.',
            type: 'string',
          },
          expected_replacements: {
            type: 'number',
            description:
              'Number of replacements expected. Defaults to 1 if not specified. Use when you want to replace multiple occurrences.',
            minimum: 1,
          },
        },
        required: ['file_path', 'instruction', 'old_string', 'new_string'],
        type: 'object',
      },
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

  getModifyContext(signal: AbortSignal): ModifyContext<EditToolParams> {
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
          let currentContent = await this.config
            .getFileSystemService()
            .readTextFile(params.file_path);

          const originalLineEnding = detectLineEnding(currentContent);
          currentContent = currentContent.replace(/\r\n/g, '\n');

          if (params.old_string === '' && currentContent === '') {
            return params.new_string;
          }

          const result = await calculateReplacement(this.config, {
            params,
            currentContent,
            abortSignal: signal,
          });

          let finalContent = result.newContent;
          if (originalLineEnding === '\r\n') {
            finalContent = finalContent.replace(/\n/g, '\r\n');
          }
          return finalContent;
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
