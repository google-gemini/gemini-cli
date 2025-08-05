/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as Diff from 'diff';
import {
  BaseTool,
  Icon,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
  ToolLocation,
  ToolResult,
  ToolResultDisplay,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { ensureCorrectEdit, countOccurrences } from '../utils/editCorrector.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { ReadFileTool } from './read-file.js';
import { ModifiableTool, ModifyContext } from './modifiable-tool.js';
import { GeminiClient } from '../core/client.js';

/**
 * Defines the available strategies for the edit tool.
 */
export enum ReplaceStrategy {
  /** Strict, exact string replacement. */
  EXACT = 'exact',
  /** Uses the AI-powered corrector to find the best match. This is the default. */
  CORRECTOR = 'corrector',
  /** A flexible, line-by-line match that ignores whitespace. */
  FUZZY = 'fuzzy',

  FUZZY_V2 = 'fuzzy_v2',

  /** Tries a sequence of strategies, stopping at the first success. */
  COMPOSITE = 'composite',

  /** Mode just for testing. will use console.log() to log all outputs of the strategies */
  TEST_ALL = 'test_all',
}

/**
 * Parameters for the Edit tool
 */
export interface EditToolParams {
  /**
   * The absolute path to the file to modify
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
   * Whether the edit was modified manually by the user.
   */
  modified_by_user?: boolean;
}

interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  occurrences: number;
  error?: { display: string; raw: string; type: ToolErrorType };
  isNewFile: boolean;
}

// --- Edit Strategy Implementation ---

interface ReplaceStrategyContext {
  params: EditToolParams;
  currentContent: string;
  geminiClient: GeminiClient;
  abortSignal: AbortSignal;
}

interface ReplaceStrategyResult {
  newContent: string;
  occurrences: number;
  finalOldString: string;
  finalNewString: string;
  mode: ReplaceStrategy;
}

interface ReplaceStrategyImpl {
  readonly mode: ReplaceStrategy;
  performEdit(context: ReplaceStrategyContext): Promise<ReplaceStrategyResult>;
}

class ExactStrategy implements ReplaceStrategyImpl {
  readonly mode = ReplaceStrategy.EXACT;
  async performEdit(
    context: ReplaceStrategyContext,
  ): Promise<ReplaceStrategyResult> {
    const { currentContent, params } = context;
    const finalOldString = params.old_string.replace(/\r\n/g, '\n');
    const finalNewString = params.new_string.replace(/\r\n/g, '\n');
    const occurrences = countOccurrences(currentContent, finalOldString);
    const newContent = currentContent.replaceAll(
      finalOldString,
      finalNewString,
    );
    return {
      newContent,
      occurrences,
      finalOldString,
      finalNewString,
      mode: this.mode,
    };
  }
}

class CorrectorStrategy implements ReplaceStrategyImpl {
  readonly mode = ReplaceStrategy.CORRECTOR;
  async performEdit(
    context: ReplaceStrategyContext,
  ): Promise<ReplaceStrategyResult> {
    const { currentContent, params, geminiClient, abortSignal } = context;
    const correctedEdit = await ensureCorrectEdit(
      params.file_path,
      currentContent,
      params,
      geminiClient,
      abortSignal,
    );
    const {
      params: { old_string: finalOldString, new_string: finalNewString },
      occurrences,
    } = correctedEdit;
    const newContent = currentContent.replaceAll(
      finalOldString,
      finalNewString,
    );
    return {
      newContent,
      occurrences,
      finalOldString,
      finalNewString,
      mode: this.mode,
    };
  }
}

class FuzzyStrategyV2 implements ReplaceStrategyImpl {
  readonly mode = ReplaceStrategy.FUZZY_V2;
  async performEdit(
    context: ReplaceStrategyContext,
  ): Promise<ReplaceStrategyResult> {
    const { currentContent, params } = context;
    const { old_string, new_string } = params;
    const hadTrailingNewline = currentContent.endsWith('\n');

    const normalizedCode = currentContent;
    const normalizedSearch = old_string.replace(/\r\n/g, '\n');
    const normalizedReplace = new_string.replace(/\r\n/g, '\n');

    if (normalizedSearch === '') {
      return {
        newContent: currentContent,
        occurrences: 0,
        finalOldString: normalizedSearch,
        finalNewString: normalizedReplace,
        mode: this.mode,
      };
    }

    const exactOccurrences = normalizedCode.split(normalizedSearch).length - 1;
    if (exactOccurrences > 0) {
      let modifiedCode = normalizedCode.replaceAll(
        normalizedSearch,
        normalizedReplace,
      );
      if (hadTrailingNewline && !modifiedCode.endsWith('\n')) {
        modifiedCode += '\n';
      } else if (!hadTrailingNewline && modifiedCode.endsWith('\n')) {
        modifiedCode = modifiedCode.replace(/\n$/, '');
      }
      return {
        newContent: modifiedCode,
        occurrences: exactOccurrences,
        finalOldString: normalizedSearch,
        finalNewString: normalizedReplace,
        mode: this.mode,
      };
    }

    const sourceLines = normalizedCode.match(/.*(?:\n|$)/g)?.slice(0, -1) ?? [];
    const searchLinesStripped = normalizedSearch
      .split('\n')
      .map((line) => line.trim());
    const searchLines = normalizedSearch.split('\n'); // testing more robust indentation
    const replaceLines = normalizedReplace.split('\n');

    let flexibleOccurrences = 0;
    let i = 0;
    while (i <= sourceLines.length - searchLinesStripped.length) {
      const window = sourceLines.slice(i, i + searchLinesStripped.length);
      const windowStripped = window.map((line) => line.trim());
      const isMatch = windowStripped.every(
        (line, index) => line === searchLinesStripped[index],
      );

      if (isMatch) {
        flexibleOccurrences++;
        const originalIndent = window[0].match(/^\s*/)?.[0] || '';

        const newBlockWithIndent = replaceLines.map((line, index) => {
          if (index === 0) {
            return originalIndent + line.trimStart();
          }
          const oldLineIndent = searchLines[index]?.match(/^\s*/)?.[0] || '';
          const newLineIndent = line.match(/^\s*/)?.[0] || '';

          if (oldLineIndent && newLineIndent) {
            const relativeIndentLength =
              newLineIndent.length - oldLineIndent.length;
            const relativeIndent = ' '.repeat(
              Math.max(0, relativeIndentLength),
            );
            return originalIndent + relativeIndent + line.trimStart();
          }
          return originalIndent + line;
        });
        sourceLines.splice(
          i,
          searchLinesStripped.length,
          ...newBlockWithIndent,
        );
        i += replaceLines.length;
      } else {
        i++;
      }
    }

    if (flexibleOccurrences > 0) {
      let modifiedCode = sourceLines.join('');
      if (hadTrailingNewline && !modifiedCode.endsWith('\n')) {
        modifiedCode += '\n';
      } else if (!hadTrailingNewline && modifiedCode.endsWith('\n')) {
        modifiedCode = modifiedCode.replace(/\n$/, '');
      }
      return {
        newContent: modifiedCode,
        occurrences: flexibleOccurrences,
        finalOldString: normalizedSearch,
        finalNewString: normalizedReplace,
        mode: this.mode,
      };
    }

    return {
      newContent: currentContent,
      occurrences: 0,
      finalOldString: normalizedSearch,
      finalNewString: normalizedReplace,
      mode: this.mode,
    };
  }
}

class FuzzyStrategy implements ReplaceStrategyImpl {
  readonly mode = ReplaceStrategy.FUZZY;
  async performEdit(
    context: ReplaceStrategyContext,
  ): Promise<ReplaceStrategyResult> {
    const { currentContent, params } = context;
    const { old_string, new_string } = params;
    const hadTrailingNewline = currentContent.endsWith('\n');

    const normalizedCode = currentContent;
    const normalizedSearch = old_string.replace(/\r\n/g, '\n');
    const normalizedReplace = new_string.replace(/\r\n/g, '\n');

    if (normalizedSearch === '') {
      return {
        newContent: currentContent,
        occurrences: 0,
        finalOldString: normalizedSearch,
        finalNewString: normalizedReplace,
        mode: this.mode,
      };
    }

    const exactOccurrences = normalizedCode.split(normalizedSearch).length - 1;
    if (exactOccurrences > 0) {
      let modifiedCode = normalizedCode.replaceAll(
        normalizedSearch,
        normalizedReplace,
      );
      if (hadTrailingNewline && !modifiedCode.endsWith('\n')) {
        modifiedCode += '\n';
      } else if (!hadTrailingNewline && modifiedCode.endsWith('\n')) {
        modifiedCode = modifiedCode.replace(/\n$/, '');
      }
      return {
        newContent: modifiedCode,
        occurrences: exactOccurrences,
        finalOldString: normalizedSearch,
        finalNewString: normalizedReplace,
        mode: this.mode,
      };
    }

    const sourceLines = normalizedCode.match(/.*(?:\n|$)/g)?.slice(0, -1) ?? [];
    const searchLinesStripped = normalizedSearch
      .split('\n')
      .map((line) => line.trim());
    const replaceLines = normalizedReplace.split('\n');

    let flexibleOccurrences = 0;
    let i = 0;
    while (i <= sourceLines.length - searchLinesStripped.length) {
      const window = sourceLines.slice(i, i + searchLinesStripped.length);
      const windowStripped = window.map((line) => line.trim());
      const isMatch = windowStripped.every(
        (line, index) => line === searchLinesStripped[index],
      );

      if (isMatch) {
        flexibleOccurrences++;
        const firstLineInMatch = window[0];
        const indentationMatch = firstLineInMatch.match(/^(\s*)/);
        const indentation = indentationMatch ? indentationMatch[1] : '';
        const newBlockWithIndent = replaceLines.map(
          (line) => `${indentation}${line}`,
        );
        sourceLines.splice(
          i,
          searchLinesStripped.length,
          ...newBlockWithIndent,
        );
        i += replaceLines.length;
      } else {
        i++;
      }
    }

    if (flexibleOccurrences > 0) {
      let modifiedCode = sourceLines.join('');
      if (hadTrailingNewline && !modifiedCode.endsWith('\n')) {
        modifiedCode += '\n';
      } else if (!hadTrailingNewline && modifiedCode.endsWith('\n')) {
        modifiedCode = modifiedCode.replace(/\n$/, '');
      }
      return {
        newContent: modifiedCode,
        occurrences: flexibleOccurrences,
        finalOldString: normalizedSearch,
        finalNewString: normalizedReplace,
        mode: this.mode,
      };
    }

    return {
      newContent: currentContent,
      occurrences: 0,
      finalOldString: normalizedSearch,
      finalNewString: normalizedReplace,
      mode: this.mode,
    };
  }
}

interface ValidationContext {
  occurrences: number;
  expectedReplacements: number;
  finalOldString: string;
  finalNewString: string;
  mode: ReplaceStrategy;
  filePath: string;
}

function validateEditResult(
  context: Omit<ValidationContext, 'mode'>,
): CalculatedEdit['error'] | undefined {
  const {
    occurrences,
    expectedReplacements,
    finalOldString,
    finalNewString,
    filePath,
  } = context;

  if (occurrences === 0) {
    return {
      display: `Failed to edit, could not find the string to replace.`,
      raw: `Failed to edit, 0 occurrences found for old_string in ${filePath}. No edits made.`,
      type: ToolErrorType.EDIT_NO_OCCURRENCE_FOUND,
    };
  }
  if (occurrences !== expectedReplacements) {
    const term = expectedReplacements === 1 ? 'occurrence' : 'occurrences';
    return {
      display: `Failed to edit, expected ${expectedReplacements} ${term} but found ${occurrences}.`,
      raw: `Expected ${expectedReplacements} ${term} but found ${occurrences} for old_string in ${filePath}.`,
      type: ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH,
    };
  }
  if (finalOldString === finalNewString) {
    return {
      display: `No changes to apply. The old_string and new_string are identical.`,
      raw: `No changes to apply. The old_string and new_string are identical in file: ${filePath}.`,
      type: ToolErrorType.EDIT_NO_CHANGE,
    };
  }
  return undefined;
}

class CompositeStrategy implements ReplaceStrategyImpl {
  readonly mode = ReplaceStrategy.COMPOSITE;
  private strategies: ReplaceStrategyImpl[];

  constructor(
    strategies: ReplaceStrategyImpl[] = [
      new ExactStrategy(),
      new FuzzyStrategy(),
      new CorrectorStrategy(),
    ],
  ) {
    this.strategies = strategies;
  }

  async performEdit(
    context: ReplaceStrategyContext,
  ): Promise<ReplaceStrategyResult> {
    const { params } = context;
    const expectedReplacements = params.expected_replacements ?? 1;

    for (const strategy of this.strategies) {
      try {
        const result = await strategy.performEdit(context);
        const validationError = validateEditResult({
          ...result,
          expectedReplacements,
          filePath: params.file_path,
        });

        if (!validationError) {
          return result; // Found a successful and valid strategy
        }
      } catch (_e) {
        // Ignore errors and try the next strategy
      }
    }

    // If no strategy succeeded, return a failure state
    return {
      newContent: context.currentContent,
      occurrences: 0,
      finalOldString: params.old_string,
      finalNewString: params.new_string,
      mode: this.mode,
    };
  }
}

class TestAllStrategy implements ReplaceStrategyImpl {
  readonly mode = ReplaceStrategy.TEST_ALL;
  private strategies: ReplaceStrategyImpl[];

  constructor(
    strategies: ReplaceStrategyImpl[] = [
      new ExactStrategy(),
      new FuzzyStrategy(),
      new FuzzyStrategyV2(),
      new CorrectorStrategy(),
    ],
  ) {
    this.strategies = strategies;
  }

  async performEdit(
    context: ReplaceStrategyContext,
  ): Promise<ReplaceStrategyResult> {
    const { params } = context;
    const expectedReplacements = params.expected_replacements ?? 1;
    let correctorResultToReturn: ReplaceStrategyResult | null = null;
    const allResults: Record<string, unknown> = {
      old_string: params.old_string,
      new_string: params.new_string,
    };

    for (const strategy of this.strategies) {
      try {
        const result = await strategy.performEdit(context);
        const validationError = validateEditResult({
          ...result,
          expectedReplacements,
          filePath: params.file_path,
        });
        const errorType = validationError?.type ?? 'success';

        allResults[strategy.mode] = {
          final_old_string: result.finalOldString,
          final_new_string: result.finalNewString,
          error_type: errorType,
        };

        if (strategy.mode === ReplaceStrategy.CORRECTOR) {
          correctorResultToReturn = result;
        }
      } catch (e) {
        const errorType = e instanceof Error ? e.message : String(e);
        allResults[strategy.mode] = {
          old_string: params.old_string,
          new_string: params.new_string,
          error_type: `exception: ${errorType}`,
        };
        if (strategy.mode === ReplaceStrategy.CORRECTOR) {
          // If corrector throws, we still need to return a "result" for it
          // so the calling function can see it failed.
          correctorResultToReturn = {
            newContent: context.currentContent,
            occurrences: 0,
            finalOldString: params.old_string,
            finalNewString: params.new_string,
            mode: ReplaceStrategy.CORRECTOR,
          };
        }
      }
    }

    console.log(
      '\n' + JSON.stringify({ test_all_results: allResults }, null, 0) + '\n',
    );

    if (correctorResultToReturn) {
      return correctorResultToReturn;
    }

    // This case would be hit if CorrectorStrategy is not in the list.
    // We should return a failure state.
    return {
      newContent: context.currentContent,
      occurrences: 0,
      finalOldString: params.old_string,
      finalNewString: params.new_string,
      mode: this.mode,
    };
  }
}

const editStrategies: Record<ReplaceStrategy, ReplaceStrategyImpl> = {
  [ReplaceStrategy.EXACT]: new ExactStrategy(),
  [ReplaceStrategy.CORRECTOR]: new CorrectorStrategy(),
  [ReplaceStrategy.FUZZY]: new FuzzyStrategy(),
  [ReplaceStrategy.FUZZY_V2]: new FuzzyStrategyV2(),
  [ReplaceStrategy.COMPOSITE]: new CompositeStrategy(),
  [ReplaceStrategy.TEST_ALL]: new TestAllStrategy(),
};

/**
 * Implementation of the Edit tool logic
 */
export class EditTool
  extends BaseTool<EditToolParams, ToolResult>
  implements ModifiableTool<EditToolParams>
{
  static readonly Name = 'replace';

  constructor(private readonly config: Config) {
    super(
      EditTool.Name,
      'Edit',
      `Replaces text within a file. By default, replaces a single occurrence, but can replace multiple occurrences when \`expected_replacements\` is specified. This tool requires providing significant context around the change to ensure precise targeting. Always use the ${ReadFileTool.Name} tool to examine the file's current content before attempting a text replacement.

      The user has the ability to modify the \`new_string\` content. If modified, this will be stated in the response.

Expectation for required parameters:
1. \`file_path\` MUST be an absolute path; otherwise an error will be thrown.
2. \`old_string\` MUST be the exact literal text to replace (including all whitespace, indentation, newlines, and surrounding code etc.).
3. \`new_string\` MUST be the exact literal text to replace \`old_string\` with (also including all whitespace, indentation, newlines, and surrounding code etc.). Ensure the resulting code is correct and idiomatic.
4. NEVER escape \`old_string\` or \`new_string\`, that would break the exact literal text requirement.
**Important:** If ANY of the above are not satisfied, the tool will fail. CRITICAL for \`old_string\`: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations, or does not match exactly, the tool will fail.
**Multiple replacements:** Set \`expected_replacements\` to the number of occurrences you want to replace. The tool will replace ALL occurrences that match \`old_string\` exactly. Ensure the number of replacements matches your expectation.`,
      Icon.Pencil,
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to modify. Must start with '/'.",
            type: Type.STRING,
          },
          old_string: {
            description:
              'The exact literal text to replace, preferably unescaped. For single replacements (default), include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. For multiple replacements, specify expected_replacements parameter. If this string is not the exact literal text (i.e. you escaped it) or does not match exactly, the tool will fail.',
            type: Type.STRING,
          },
          new_string: {
            description:
              'The exact literal text to replace `old_string` with, preferably unescaped. Provide the EXACT text. Ensure the resulting code is correct and idiomatic.',
            type: Type.STRING,
          },
          expected_replacements: {
            type: Type.NUMBER,
            description:
              'Number of replacements expected. Defaults to 1 if not specified. Use when you want to replace multiple occurrences.',
            minimum: 1,
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
        type: Type.OBJECT,
      },
    );
    console.log(`Replace strategy : ${this.config.getReplaceStrategy()}`);
  }

  /**
   * Validates the parameters for the Edit tool
   * @param params Parameters to validate
   * @returns Error message string or null if valid
   */
  validateToolParams(params: EditToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (!path.isAbsolute(params.file_path)) {
      return `File path must be absolute: ${params.file_path}`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(params.file_path)) {
      const directories = workspaceContext.getDirectories();
      return `File path must be within one of the workspace directories: ${directories.join(', ')}`;
    }

    return null;
  }

  /**
   * Determines any file locations affected by the tool execution
   * @param params Parameters for the tool execution
   * @returns A list of such paths
   */
  toolLocations(params: EditToolParams): ToolLocation[] {
    return [{ path: params.file_path }];
  }

  private _applyReplacement(
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
    return currentContent.replaceAll(oldString, newString);
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
    let isNewFile = false;
    let error: CalculatedEdit['error'];

    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
      // Normalize line endings to LF for consistent processing.
      currentContent = currentContent.replace(/\r\n/g, '\n');
      fileExists = true;
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        // Rethrow unexpected FS errors (permissions, etc.)
        throw err;
      }
      fileExists = false;
    }

    if (params.old_string === '' && !fileExists) {
      // Creating a new file
      isNewFile = true;
      return {
        currentContent,
        newContent: params.new_string,
        occurrences: 0,
        isNewFile,
      };
    }

    if (!fileExists) {
      // Trying to edit a nonexistent file (and old_string is not empty)
      error = {
        display: `File not found. Cannot apply edit. Use an empty old_string to create a new file.`,
        raw: `File not found: ${params.file_path}`,
        type: ToolErrorType.FILE_NOT_FOUND,
      };
    } else if (currentContent === null) {
      // Should not happen if fileExists and no exception was thrown, but defensively:
      error = {
        display: `Failed to read content of file.`,
        raw: `Failed to read content of existing file: ${params.file_path}`,
        type: ToolErrorType.READ_CONTENT_FAILURE,
      };
    } else if (params.old_string === '') {
      // Error: Trying to create a file that already exists
      error = {
        display: `Failed to edit. Attempted to create a file that already exists.`,
        raw: `File already exists, cannot create: ${params.file_path}`,
        type: ToolErrorType.ATTEMPT_TO_CREATE_EXISTING_FILE,
      };
    }

    if (error) {
      return {
        currentContent,
        newContent: currentContent ?? '',
        occurrences: 0,
        error,
        isNewFile,
      };
    }

    // Editing an existing file
    let editStrategy = this.config.getReplaceStrategy();
    // check if editStrategy is of type ReplaceStrategy
    if (!(editStrategy in editStrategies)) {
      console.warn(
        `Invalid edit strategy: ${editStrategy}. Defaulting to ${editStrategy}.`,
      );
      editStrategy = ReplaceStrategy.CORRECTOR;
    }
    const strategy = editStrategies[editStrategy];
    const strategyContext: ReplaceStrategyContext = {
      params,
      currentContent: currentContent!,
      geminiClient: this.config.getGeminiClient(),
      abortSignal,
    };

    const result = await strategy.performEdit(strategyContext);

    const validationError = validateEditResult({
      ...result,
      expectedReplacements,
      filePath: params.file_path,
    });

    return {
      currentContent,
      newContent: result.newContent,
      occurrences: result.occurrences,
      error: validationError,
      isNewFile,
    };
  }

  /**
   * Handles the confirmation prompt for the Edit tool in the CLI.
   * It needs to calculate the diff to show the user.
   */
  async shouldConfirmExecute(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }
    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(
        `[EditTool Wrapper] Attempted confirmation with invalid parameters: ${validationError}`,
      );
      return false;
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params, abortSignal);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`Error preparing edit: ${errorMsg}`);
      return false;
    }

    if (editData.error) {
      console.log(`Error: ${editData.error.display}`);
      return false;
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
    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Edit: ${shortenPath(makeRelative(params.file_path, this.config.getTargetDir()))}`,
      fileName,
      fileDiff,
      originalContent: editData.currentContent,
      newContent: editData.newContent,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  getDescription(params: EditToolParams): string {
    if (!params.file_path || !params.old_string || !params.new_string) {
      return `Model did not provide valid parameters for edit tool`;
    }
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    if (params.old_string === '') {
      return `Create ${shortenPath(relativePath)}`;
    }

    const oldStringSnippet =
      params.old_string.split('\n')[0].substring(0, 30) +
      (params.old_string.length > 30 ? '...' : '');
    const newStringSnippet =
      params.new_string.split('\n')[0].substring(0, 30) +
      (params.new_string.length > 30 ? '...' : '');

    if (params.old_string === params.new_string) {
      return `No file changes to ${shortenPath(relativePath)}`;
    }
    return `${shortenPath(relativePath)}: ${oldStringSnippet} => ${newStringSnippet}`;
  }

  /**
   * Executes the edit operation with the given parameters.
   * @param params Parameters for the edit operation
   * @returns Result of the edit operation
   */
  async execute(
    params: EditToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
        error: {
          message: validationError,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params, signal);
    } catch (error) {
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
      this.ensureParentDirectoriesExist(params.file_path);
      fs.writeFileSync(params.file_path, editData.newContent, 'utf8');

      let displayResult: ToolResultDisplay;
      if (editData.isNewFile) {
        displayResult = `Created ${shortenPath(makeRelative(params.file_path, this.config.getTargetDir()))}`;
      } else {
        // Generate diff for display, even though core logic doesn't technically need it
        // The CLI wrapper will use this part of the ToolResult
        const fileName = path.basename(params.file_path);
        const fileDiff = Diff.createPatch(
          fileName,
          editData.currentContent ?? '', // Should not be null here if not isNewFile
          editData.newContent,
          'Current',
          'Proposed',
          DEFAULT_DIFF_OPTIONS,
        );
        displayResult = {
          fileDiff,
          fileName,
          originalContent: editData.currentContent,
          newContent: editData.newContent,
        };
      }

      const llmSuccessMessageParts = [
        editData.isNewFile
          ? `Created new file: ${params.file_path} with provided content.`
          : `Successfully modified file: ${params.file_path} (${editData.occurrences} replacements).`,
      ];
      if (params.modified_by_user) {
        llmSuccessMessageParts.push(
          `User modified the \`new_string\` content to be: ${params.new_string}.`,
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
  private ensureParentDirectoriesExist(filePath: string): void {
    const dirName = path.dirname(filePath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
  }

  getModifyContext(_: AbortSignal): ModifyContext<EditToolParams> {
    return {
      getFilePath: (params: EditToolParams) => params.file_path,
      getCurrentContent: async (params: EditToolParams): Promise<string> => {
        try {
          return fs.readFileSync(params.file_path, 'utf8');
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      getProposedContent: async (params: EditToolParams): Promise<string> => {
        try {
          const currentContent = fs.readFileSync(params.file_path, 'utf8');
          return this._applyReplacement(
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
      ): EditToolParams => ({
        ...originalParams,
        old_string: oldContent,
        new_string: modifiedProposedContent,
        modified_by_user: true,
      }),
    };
  }
}
