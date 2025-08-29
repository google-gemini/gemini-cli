/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Diff from 'diff';
import {
  BaseDeclarativeTool,
  Kind,
  type ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  type ToolEditConfirmationDetails,
  type ToolInvocation,
  type ToolLocation,
  type ToolResult,
  type ToolResultDisplay,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import { type Config, ApprovalMode } from '../config/config.js';
import { DEFAULT_DIFF_OPTIONS, getDiffStat } from './diffOptions.js';
import { ReadFileTool } from './read-file.js';
import {
  type ModifiableDeclarativeTool,
  type ModifyContext,
} from './modifiable-tool.js';
import { IDEConnectionStatus } from '../ide/ide-client.js';
import { FixLLMEditWithInstruction } from '../utils/llm-edit-fixer.js';

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
  return currentContent.replaceAll(oldString, newString);
}

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
    let modifiedCode = normalizedCode.replaceAll(
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
      const indentationMatch = firstLineInMatch.match(/^(\s*)/);
      const indentation = indentationMatch ? indentationMatch[1] : '';
      const newBlockWithIndent = replaceLines.map(
        (line: string) => `${indentation}${line}`,
      );
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

/**
 * Detects the line ending style of a string.
 * @param content The string content to analyze.
 * @returns '\r\n' for Windows-style, '\n' for Unix-style.
 */
function detectLineEnding(content: string): '\r\n' | '\n' {
  // If a Carriage Return is found, assume Windows-style endings.
  // This is a simple but effective heuristic.
  return content.includes('\r\n') ? '\r\n' : '\n';
}

export async function calculateReplacement(
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
    return exactResult;
  }

  const flexibleResult = await calculateFlexibleReplacement(context);
  if (flexibleResult) {
    return flexibleResult;
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
      raw: `Failed to edit, 0 occurrences found for old_string (${finalOldString}). Original old_string was (${params.old_string}) in ${params.file_path}. No edits made. The exact text in old_string was not found. Ensure you're not escaping content incorrectly and check whitespace, indentation, and context. Use ${ReadFileTool.Name} tool to verify.`,
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
   * The instruction for what needs to be done.
   */
  instruction: string;

  /**
   * Whether the edit was modified manually by the user.
   */
  modified_by_user?: boolean;

  /**
   * Initially proposed string.
   */
  ai_proposed_string?: string;
}

interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  occurrences: number;
  error?: { display: string; raw: string; type: ToolErrorType };
  isNewFile: boolean;
  originalLineEnding: '\r\n' | '\n';
}

class EditToolInvocation implements ToolInvocation<EditToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    public params: EditToolParams,
  ) {}

  toolLocations(): ToolLocation[] {
    return [{ path: this.params.file_path }];
  }

  private async attemptSelfCorrection(
    params: EditToolParams,
    currentContent: string,
    initialError: { display: string; raw: string; type: ToolErrorType },
    abortSignal: AbortSignal,
    originalLineEnding: '\r\n' | '\n',
  ): Promise<CalculatedEdit> {
    const fixedEdit = await FixLLMEditWithInstruction(
      params.instruction,
      params.old_string,
      params.new_string,
      initialError.raw,
      currentContent,
      this.config.getGeminiClient(),
      abortSignal,
    );

    if (fixedEdit.noChangesRequired) {
      return {
        currentContent,
        newContent: currentContent,
        occurrences: 0,
        isNewFile: false,
        error: {
          display: `No changes required. The file already meets the specified conditions.`,
          raw: `A secondary check determined that no changes were necessary to fulfill the instruction. Explanation: ${fixedEdit.explanation}. Original error with the parameters given: ${initialError.raw}`,
          type: ToolErrorType.EDIT_NO_CHANGE,
        },
        originalLineEnding,
      };
    }

    const secondAttemptResult = await calculateReplacement({
      params: {
        ...params,
        old_string: fixedEdit.search,
        new_string: fixedEdit.replace,
      },
      currentContent,
      abortSignal,
    });

    const secondError = getErrorReplaceResult(
      params,
      secondAttemptResult.occurrences,
      1, // expectedReplacements is always 1 for smart_edit
      secondAttemptResult.finalOldString,
      secondAttemptResult.finalNewString,
    );

    if (secondError) {
      // The fix failed, return the original error
      return {
        currentContent,
        newContent: currentContent,
        occurrences: 0,
        isNewFile: false,
        error: initialError,
        originalLineEnding,
      };
    }

    return {
      currentContent,
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
    const expectedReplacements = 1;
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

    const replacementResult = await calculateReplacement({
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
  async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(this.params, abortSignal);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`Error preparing edit: ${errorMsg}`);
      return false;
    }

    if (editData.error) {
      console.log(`Error: ${editData.error.display}`);
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
    const ideClient = this.config.getIdeClient();
    const ideConfirmation =
      this.config.getIdeMode() &&
      ideClient?.getConnectionStatus().status === IDEConnectionStatus.Connected
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
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
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
    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(this.params, signal);
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
      this.ensureParentDirectoriesExist(this.params.file_path);
      let finalContent = editData.newContent;

      // Restore original line endings if they were CRLF
      if (!editData.isNewFile && editData.originalLineEnding === '\r\n') {
        finalContent = finalContent.replace(/\n/g, '\r\n');
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
        const originallyProposedContent =
          this.params.ai_proposed_string || this.params.new_string;
        const diffStat = getDiffStat(
          fileName,
          editData.currentContent ?? '',
          originallyProposedContent,
          this.params.new_string,
        );
        displayResult = {
          fileDiff,
          fileName,
          originalContent: editData.currentContent,
          newContent: editData.newContent,
          diffStat,
        };
      }

      const llmSuccessMessageParts = [
        editData.isNewFile
          ? `Created new file: ${this.params.file_path} with provided content.`
          : `Successfully modified file: ${this.params.file_path} (${editData.occurrences} replacements).`,
      ];
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
  private ensureParentDirectoriesExist(filePath: string): void {
    const dirName = path.dirname(filePath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
  }
}

/**
 * Implementation of the Edit tool logic
 */
export class SmartEditTool
  extends BaseDeclarativeTool<EditToolParams, ToolResult>
  implements ModifiableDeclarativeTool<EditToolParams>
{
  static readonly Name = 'smart_edit';

  constructor(private readonly config: Config) {
    super(
      SmartEditTool.Name,
      'Edit',
      `Replaces text within a file. Replaces a single occurrence. This tool requires providing significant context around the change to ensure precise targeting. Always use the ${ReadFileTool.Name} tool to examine the file's current content before attempting a text replacement.
      
      The user has the ability to modify the \`new_string\` content. If modified, this will be stated in the response.
      
      Expectation for required parameters:
      1. \`file_path\` MUST be an absolute path; otherwise an error will be thrown.
      2. \`old_string\` MUST be the exact literal text to replace (including all whitespace, indentation, newlines, and surrounding code etc.).
      3. \`new_string\` MUST be the exact literal text to replace \`old_string\` with (also including all whitespace, indentation, newlines, and surrounding code etc.). Ensure the resulting code is correct and idiomatic and that \`old_string\` and \`new_string\` are different.
      4. \`instruction\` is the detailed instruction of what needs to be changed. It is important to Make it specific and detailed so developers or large language models can understand what needs to be changed and perform the changes on their own if necessary. 
      5. NEVER escape \`old_string\` or \`new_string\`, that would break the exact literal text requirement.
      **Important:** If ANY of the above are not satisfied, the tool will fail. CRITICAL for \`old_string\`: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations, or does not match exactly, the tool will fail.
      6. Prefer to break down complex and long changes into multiple smaller atomic calls to this tool. Always check the content of the file after changes or not finding a string to match.
      **Multiple replacements:** If there are multiple and ambiguous occurences of the \`old_string\` in the file, the tool will also fail.`,
      Kind.Edit,
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to modify. Must start with '/'.",
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
              'The exact literal text to replace, preferably unescaped. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string is not the exact literal text (i.e. you escaped it) or does not match exactly, the tool will fail.',
            type: 'string',
          },
          new_string: {
            description:
              'The exact literal text to replace `old_string` with, preferably unescaped. Provide the EXACT text. Ensure the resulting code is correct and idiomatic.',
            type: 'string',
          },
        },
        required: ['file_path', 'instruction', 'old_string', 'new_string'],
        type: 'object',
      },
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

  protected createInvocation(
    params: EditToolParams,
  ): ToolInvocation<EditToolParams, ToolResult> {
    return new EditToolInvocation(this.config, params);
  }

  getModifyContext(_: AbortSignal): ModifyContext<EditToolParams> {
    return {
      getFilePath: (params: EditToolParams) => params.file_path,
      getCurrentContent: async (params: EditToolParams): Promise<string> => {
        try {
          return this.config
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
          ai_proposed_string: content,
          old_string: oldContent,
          new_string: modifiedProposedContent,
          modified_by_user: true,
        };
      },
    };
  }
}
