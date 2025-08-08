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
import { Content, Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { ReadFileTool } from './read-file.js';
import { ModifiableTool, ModifyContext } from './modifiable-tool.js';
import { GeminiClient } from '../core/client.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';

export enum ReplaceStrategy {
  FUZZY = 'fuzzy',
}

const EDIT_SYS_PROMPT = `
You are an expert code-editing assistant specializing in debugging and correcting failed search-and-replace operations.

# Primary Goal
Your task is to analyze a failed edit attempt and provide a corrected \`search\` string that will match the text in the file precisely. The correction should be as minimal as possible, staying very close to the original, failed \`search\` string. Do NOT invent a completely new edit based on the instruction; your job is to fix the provided parameters.

It is important that you do no try to figure ou if the instruction is correct. DO NOT GIVE ADVICE. Your only goal here is to do your best to perform the search and replace task! 

# Input Context
You will be given:
1. The high-level instruction for the original edit.
2. The exact \`search\` and \`replace\` strings that failed.
3. The error message that was produced.
4. The full content of the source file.

# Rules for Correction
1.  **Minimal Correction:** Your new \`search\` string must be a close variation of the original. Focus on fixing issues like whitespace, indentation, line endings, or small contextual differences.
2.  **Explain the Fix:** Your \`explanation\` MUST state exactly why the original \`search\` failed and how your new \`search\` string resolves that specific failure. (e.g., "The original search failed due to incorrect indentation; the new search corrects the indentation to match the source file.").
3.  **Preserve the \`replace\` String:** Do NOT modify the \`replace\` string unless the instruction explicitly requires it and it was the source of the error. Your primary focus is fixing the \`search\` string.
4.  **No Changes Case:** CRUCIAL: if the change is already present in the file,  set \`noChangesRequired\` to True and explain why in the \`explanation\`. It is crucial that you only do this if the changes outline in \`replace\` are alredy in the file and suits the instruction!! 
5.  **Exactness:** The final \`search\` field must be the EXACT literal text from the file. Do not escape characters.
`;

const EDIT_USER_PROMPT = `
# Goal of the Original Edit
{instruction}

# Failed Attempt Details
- **Original \`search\` parameter (failed):**
\`\`\`
{old_string}
\`\`\`
- **Original \`replace\` parameter:**
\`\`\`
{new_string}
\`\`\`
- **Error Encountered:**
\`\`\`
{error}
\`\`\`

# Full File Content
\`\`\`
{current_content}
\`\`\`

# Your Task
Based on the error and the file content, provide a corrected \`search\` string that will succeed. Remember to keep your correction minimal and explain the precise reason for the failure in your \`explanation\`.
`;

/**
 * Parameters for the SmartEdit tool
 */
export interface SmartEditToolParams {
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
}

interface SearchReplaceEdit {
  search: string;
  replace: string;
  noChangesRequired: boolean;
  explanation: string;
}

const SearchReplaceEditSchema = {
  type: Type.OBJECT,
  properties: {
    search: { type: Type.STRING },
    replace: { type: Type.STRING },
    noChangesRequired: { type: Type.BOOLEAN },
    explanation: { type: Type.STRING },
  },
  required: ['search', 'replace', 'explanation'],
};

interface ReplaceStrategyContext {
  params: SmartEditToolParams;
  currentContent: string;
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

class FuzzyStrategy implements ReplaceStrategyImpl {
  readonly mode = ReplaceStrategy.FUZZY;
  /**
   * Performs a fuzzy search and replace operation.
   * @param context The context for the replace operation.
   * @returns The result of the replace operation.
   */
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

interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  occurrences: number;
  error?: { display: string; raw: string; type: ToolErrorType };
  isNewFile: boolean;
}

/**
 * Implementation of the SmartEdit tool logic
 */
export class SmartEditTool
  extends BaseTool<SmartEditToolParams, ToolResult>
  implements ModifiableTool<SmartEditToolParams>
{
  static readonly Name = 'smart_edit';
  private editCache: CalculatedEdit | null = null;

  constructor(private readonly config: Config) {
    super(
      SmartEditTool.Name,
      'Smart Edit',
      `Replaces text within a file. Replaces a single occurrence. This tool requires providing significant context around the change to ensure precise targeting. Always use the ${ReadFileTool.Name} tool to examine the file's current content before attempting a text replacement.
      
      The user has the ability to modify the \`new_string\` content. If modified, this will be stated in the response.
      
      Expectation for required parameters:
      1. \`file_path\` MUST be an absolute path; otherwise an error will be thrown.
      2. \`old_string\` MUST be the exact literal text to replace (including all whitespace, indentation, newlines, and surrounding code etc.).
      3. \`new_string\` MUST be the exact literal text to replace \`old_string\` with (also including all whitespace, indentation, newlines, and surrounding code etc.). Ensure the resulting code is correct and idiomatic and that \`old_string\` and \`new_string\` are different.
      4.  \`instruction\` is the detailed instruction of what needs to be changed. It is important to Make it specific and detailed so developers or large language models can understand what needs to be changed and perform the changes on their own if necessary. 
      5. NEVER escape \`old_string\` or \`new_string\`, that would break the exact literal text requirement.
      **Important:** If ANY of the above are not satisfied, the tool will fail. CRITICAL for \`old_string\`: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations, or does not match exactly, the tool will fail.
      6. Prefer to break down complex and long changes into multiple smaller atomic calls to this tool. Always check the content of the file after changes or not finding a string to match.
      **Multiple replacements:** If there are multiple and ambiguous occurences of the \`old_string\` in the file, the tool will also fail.`,
      Icon.Pencil,
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to modify. Must start with '/'.",
            type: Type.STRING,
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
            type: Type.STRING,
          },
          old_string: {
            description:
              'The exact literal text to replace, preferably unescaped. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string is not the exact literal text (i.e. you escaped it) or does not match exactly, the tool will fail.',
            type: Type.STRING,
          },
          new_string: {
            description:
              'The exact literal text to replace `old_string` with, preferably unescaped. Provide the EXACT text. Ensure the resulting code is correct and idiomatic.',
            type: Type.STRING,
          },
        },
        required: ['file_path', 'instruction', 'old_string', 'new_string'],
        type: Type.OBJECT,
      },
    );
  }

  /**
   * Validates the parameters for the SmartEdit tool
   * @param params Parameters to validate
   * @returns Error message string or null if valid
   */
  validateToolParams(params: SmartEditToolParams): string | null {
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
      return `File path must be within one of the workspace directories: ${directories.join(
        ', ',
      )}`;
    }

    return null;
  }

  /**
   * Determines any file locations affected by the tool execution
   * @param params Parameters for the tool execution
   * @returns A list of such paths
   */
  toolLocations(params: SmartEditToolParams): ToolLocation[] {
    return [{ path: params.file_path }];
  }

  /**
   * Attempts to fix a failed edit by using an LLM to generate a new search and replace pair.
   * @param instruction The instruction for what needs to be done.
   * @param old_string The original string to be replaced.
   * @param new_string The original replacement string.
   * @param error The error that occurred during the initial edit.
   * @param current_content The current content of the file.
   * @param geminiClient The Gemini client to use for the LLM call.
   * @param abortSignal An abort signal to cancel the operation.
   * @returns A new search and replace pair.
   */
  private async fixLLMEdit(
    instruction: string,
    old_string: string,
    new_string: string,
    error: string,
    current_content: string,
    geminiClient: GeminiClient,
    abortSignal: AbortSignal,
  ): Promise<SearchReplaceEdit> {
    const userPrompt = EDIT_USER_PROMPT.replace('{instruction}', instruction)
      .replace('{old_string}', old_string)
      .replace('{new_string}', new_string)
      .replace('{error}', error)
      .replace('{current_content}', current_content);

    const contents: Content[] = [
      { role: 'user', parts: [{ text: `${EDIT_SYS_PROMPT}\n${userPrompt}` }] },
    ];

    const result = (await geminiClient.generateJson(
      contents,
      SearchReplaceEditSchema,
      abortSignal,
      DEFAULT_GEMINI_MODEL,
    )) as unknown as SearchReplaceEdit;

    return result;
  }

  /**
   * Applies the replacement to the content.
   * @param currentContent The current content of the file.
   * @param oldString The string to be replaced.
   * @param newString The string to replace with.
   * @param isNewFile Whether the file is new.
   * @returns The new content.
   */
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
      return oldString === '' ? newString : '';
    }
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
    params: SmartEditToolParams,
    abortSignal: AbortSignal,
  ): Promise<CalculatedEdit> {
    const expectedReplacements = 1;
    let currentContent: string | null = null;
    let fileExists = false;
    let isNewFile = false;
    let finalNewString = params.new_string;
    let finalOldString = params.old_string;
    let occurrences = 0;
    let error:
      | { display: string; raw: string; type: ToolErrorType }
      | undefined = undefined;

    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
      // Normalize line endings to LF for consistent processing.
      currentContent = currentContent.replace(/\r\n/g, '\n');
      fileExists = true;
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        throw err;
      }
      fileExists = false;
    }

    if (params.old_string === '' && !fileExists) {
      isNewFile = true;
    } else if (!fileExists) {
      error = {
        display: `File not found. Cannot apply edit. Use an empty old_string to create a new file.`,
        raw: `File not found: ${params.file_path}`,
        type: ToolErrorType.FILE_NOT_FOUND,
      };
    } else if (currentContent !== null) {
      const replaceStrategy = new FuzzyStrategy();
      const strategyResult = await replaceStrategy.performEdit({
        params,
        currentContent,
        abortSignal,
      });

      finalOldString = strategyResult.finalOldString;
      finalNewString = strategyResult.finalNewString;
      occurrences = strategyResult.occurrences;

      error = getErrorReplaceResult(
        params,
        occurrences,
        expectedReplacements,
        finalOldString,
        finalNewString,
      );

      if (error !== undefined) {
        const fixedEdit = await this.fixLLMEdit(
          params.instruction,
          finalOldString,
          finalNewString,
          error.raw,
          currentContent,
          this.config.getGeminiClient(),
          abortSignal,
        );
        if (fixedEdit.noChangesRequired) {
          error = {
            display: `No changes required. The file already meets the specified conditions.`,
            raw: `A secondary check determined that no changes were necessary to fulfill the instruction. Explanation: ${fixedEdit.explanation}. Original error with the parameters given: ${error.raw}`,
            type: ToolErrorType.EDIT_NO_CHANGE,
          };
        } else {
          const strategyResult = await replaceStrategy.performEdit({
            params: {
              ...params,
              old_string: fixedEdit.search,
              new_string: fixedEdit.replace,
            },
            currentContent,
            abortSignal,
          });
          const errorFixed = getErrorReplaceResult(
            params,
            strategyResult.occurrences,
            expectedReplacements,
            strategyResult.finalOldString,
            strategyResult.finalNewString,
          );
          if (errorFixed === undefined) {
            // we fixed
            finalOldString = strategyResult.finalOldString;
            finalNewString = strategyResult.finalNewString;
            occurrences = strategyResult.occurrences;
            error = undefined;
          }
        }
      }
    } else {
      error = {
        display: `Failed to read content of file.`,
        raw: `Failed to read content of existing file: ${params.file_path}`,
        type: ToolErrorType.READ_CONTENT_FAILURE,
      };
    }

    const newContent = this._applyReplacement(
      currentContent,
      finalOldString,
      finalNewString,
      isNewFile,
    );

    return {
      currentContent,
      newContent,
      occurrences,
      error,
      isNewFile,
    };
  }

  /**
   * Handles the confirmation prompt for the Edit tool in the CLI.
   * It needs to calculate the diff to show the user.
   */
  async shouldConfirmExecute(
    params: SmartEditToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }
    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(
        `[SmartEditTool] Attempted confirmation with invalid parameters: ${validationError}`,
      );
      return false;
    }

    let editData: CalculatedEdit;
    try {
      this.editCache = null;
      editData = await this.calculateEdit(params, abortSignal);
      this.editCache = editData;
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
      title: `Confirm Edit: ${shortenPath(
        makeRelative(params.file_path, this.config.getTargetDir()),
      )}`,
      fileName,
      fileDiff,
      originalContent: editData.currentContent,
      newContent: editData.newContent,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        } else if (outcome === ToolConfirmationOutcome.Cancel) {
          this.editCache = null;
        }
      },
    };
    return confirmationDetails;
  }

  getDescription(params: SmartEditToolParams): string {
    if (!params.file_path || !params.instruction) {
      return `Model did not provide valid parameters for smart_edit tool`;
    }
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    return `Apply instructions "${params.instruction}" to ${shortenPath(
      relativePath,
    )}`;
  }

  /**
   * Executes the edit operation with the given parameters.
   * @param params Parameters for the edit operation
   * @returns Result of the edit operation
   */
  async execute(
    params: SmartEditToolParams,
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
    if (this.editCache) {
      editData = this.editCache;
      this.editCache = null;
    } else {
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
      let fileDiff: string;
      fileDiff = '';
      if (editData.isNewFile) {
        displayResult = `Created ${shortenPath(
          makeRelative(params.file_path, this.config.getTargetDir()),
        )}`;
      } else {
        const fileName = path.basename(params.file_path);
        fileDiff = Diff.createPatch(
          fileName,
          editData.currentContent ?? '',
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
          : `Successfully modified file: ${params.file_path}. File Diff \n\`\`\`${fileDiff}\`\`\`\n `,
      ];
      if (params.modified_by_user) {
        llmSuccessMessageParts.push(
          `User modified the instruction to be: ${params.instruction}.`,
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

  getModifyContext(_: AbortSignal): ModifyContext<SmartEditToolParams> {
    return {
      getFilePath: (params: SmartEditToolParams) => params.file_path,
      getCurrentContent: async (
        params: SmartEditToolParams,
      ): Promise<string> => {
        try {
          return fs.readFileSync(params.file_path, 'utf8');
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      getProposedContent: async (
        params: SmartEditToolParams,
      ): Promise<string> => {
        const editData = await this.calculateEdit(
          params,
          new AbortController().signal,
        );
        return editData.newContent;
      },
      createUpdatedParams: (
        _oldContent: string,
        modifiedProposedContent: string,
        originalParams: SmartEditToolParams,
      ): SmartEditToolParams => ({
        ...originalParams,
        instruction: `User provided content directly:\n${modifiedProposedContent}`,
        modified_by_user: true,
      }),
    };
  }
}
/**
 * Gets the error result for a replace operation.
 * @param params The parameters for the smart edit tool.
 * @param occurrences The number of occurrences of the old string.
 * @param expectedReplacements The expected number of replacements.
 * @param finalOldString The final old string used for replacement.
 * @param finalNewString The final new string used for replacement.
 * @returns An error object if there is an error, otherwise undefined.
 */
function getErrorReplaceResult(
  params: SmartEditToolParams,
  occurrences: number,
  expectedReplacements: number,
  finalOldString: string,
  finalNewString: string,
) {
  let error: { display: string; raw: string; type: ToolErrorType } | undefined =
    undefined;
  if (params.old_string === '') {
    error = {
      display: `Failed to edit. Attempted to create a file that already exists.`,
      raw: `File already exists, cannot create: ${params.file_path}`,
      type: ToolErrorType.ATTEMPT_TO_CREATE_EXISTING_FILE,
    };
  } else if (occurrences === 0) {
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
