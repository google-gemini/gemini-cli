/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs, mkdirSync, existsSync } from 'fs';
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
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';

// Based on the user-provided interfaces
export interface EditOperation {
  startLine: number;
  linesToDelete: number;
  contentToAdd: string[];
}

export interface RemoveAddLinesEditorParams {
  file_path: string;
  edits: EditOperation[];
  modified_by_user?: boolean;
}

interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  error?: { display: string; raw: string; type: ToolErrorType };
  isNewFile: boolean;
}

export class RemoveAddLinesEditor extends BaseTool<
  RemoveAddLinesEditorParams,
  ToolResult
> {
  static readonly Name = 'RemoveAddLinesEditor';

  constructor(private readonly config: Config) {
    super(
      RemoveAddLinesEditor.Name,
      'Remove/Add Lines Editor',
      `Modifies or creates a file using a precise list of line-based edit operations. This tool is powerful but requires absolute precision with line numbers.

### CRITICAL RULES FOR USAGE
1.  **ALWAYS read the file content immediately before using this tool.** The file can change, and using stale line numbers will corrupt the file or cause the edit to fail.
3.  **LINE NUMBERS ARE 1-BASED.** The first line of the file is line 1.

---

### Operations and Examples

#### ✏️ To REPLACE Content
Set 'linesToDelete' to the number of lines you are replacing and provide the new lines in 'contentToAdd'.

*Example 1: Replacing a single line.*
*File content before:*
\`\`\`
Line 1
Line 2 to be replaced
Line 3
\`\`\`
*Tool parameters:*
\`\`\`json
{
  "file_path": "/path/to/file.txt",
  "edits": [
    {
      "startLine": 2,
      "linesToDelete": 1,
      "contentToAdd": ["This is the new line."]
    }
  ]
}
\`\`\`

*Example 2: Replacing a placeholder comment with a multi-line code block.*
*File content before:*
\`\`\`python
def complex_function():
    # TODO: Implement the logic here
    pass
\`\`\`
*Tool parameters:*
\`\`\`json
{
  "file_path": "/path/to/code.py",
  "edits": [
    {
      "startLine": 2,
      "linesToDelete": 2,
      "contentToAdd": [
        "    result = 0",
        "    for i in range(10):",
        "        result += i",
        "    return result"
      ]
    }
  ]
}
\`\`\`
*File content after:*
\`\`\`python
def complex_function():
    result = 0
    for i in range(10):
        result += i
    return result
\`\`\`

---

#### ➕ To INSERT Content
Set 'linesToDelete' to 0. The new content will be inserted *before* the 'startLine'.

*Example 1: Inserting a single line.*
*File content before:*
\`\`\`
Line 1
Line 2
\`\`\`
*Tool parameters:*
\`\`\`json
{
  "file_path": "/path/to/file.txt",
  "edits": [
    {
      "startLine": 2,
      "linesToDelete": 0,
      "contentToAdd": ["A new line was inserted here."]
    }
  ]
}
\`\`\`

*Example 2: Inserting a multi-line docstring into a function.*
*File content before:*
\`\`\`python
def my_function(arg1, arg2):
    return arg1 + arg2
\`\`\`
*Tool parameters:*
\`\`\`json
{
  "file_path": "/path/to/code.py",
  "edits": [
    {
      "startLine": 2,
      "linesToDelete": 0,
      "contentToAdd": [
    "Args:",
        "        arg1: The first number.",
        "        arg2: The second number.",
        "    """
      ]
    }
  ]
}
\`\`\`
*File content after:*
\`\`\`python
def my_function(arg1, arg2):
    """This function adds two numbers.

    Args:
        arg1: The first number.
        arg2: The second number.
    """
    return arg1 + arg2
\`\`\`

---

#### To DELETE Content
Set 'contentToAdd' to an empty array ([]).

*Example: To delete line 2.*
*File content before:*
\`\`\`
Line 1
This line will be deleted.
Line 3
\`\`\`
*Tool parameters:*
\`\`\`json
{
  "file_path": "/path/to/file.txt",
  "edits": [
    {
      "startLine": 2,
      "linesToDelete": 1,
      "contentToAdd": []
    }
  ]
}
\`\`\`
`,
      Icon.Pencil,
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to modify. Must start with '/'.",
            type: Type.STRING,
          },
          edits: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                startLine: {
                  type: Type.NUMBER,
                  description:
                    'The 1-based line number where the edit should begin.',
                },
                linesToDelete: {
                  type: Type.NUMBER,
                  description:
                    'The number of lines to delete starting from startLine.',
                },
                contentToAdd: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING,
                  },
                  description:
                    'An array of strings representing the new lines of content to add.',
                },
              },
              required: ['startLine', 'linesToDelete', 'contentToAdd'],
            },
          },
        },
        required: ['file_path', 'edits'],
        type: Type.OBJECT,
      },
    );
  }

  validateToolParams(params: RemoveAddLinesEditorParams): string | null {
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

  toolLocations(params: RemoveAddLinesEditorParams): ToolLocation[] {
    return [{ path: params.file_path }];
  }

  private async calculateEdit(
    params: RemoveAddLinesEditorParams,
  ): Promise<CalculatedEdit> {
    let currentContent: string;
    let fileExists = false;
    let isNewFile = false;

    try {
      currentContent = await fs.readFile(params.file_path, 'utf8');
      fileExists = true;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        fileExists = false;
        isNewFile = true;
        currentContent = '';
      } else {
        throw err;
      }
    }

    const hadTrailingNewline = fileExists && currentContent.endsWith('\n');
    const originalLines = currentContent.replace(/\r\n/g, '\n').split('\n');
    const newLines: string[] = [];

    const sortedEdits = [...params.edits].sort(
      (a, b) => a.startLine - b.startLine,
    );

    let lastLineProcessed = 0;

    for (const edit of sortedEdits) {
      const { startLine, linesToDelete, contentToAdd } = edit;
      const zeroBasedStartLine = startLine - 1;

      if (zeroBasedStartLine < lastLineProcessed) {
        return {
          currentContent,
          newContent: '',
          error: {
            display: 'Edits must not overlap.',
            raw: `Overlapping edits detected. Edit at line ${startLine} conflicts with a previous edit.`,
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
          isNewFile,
        };
      }

      if (zeroBasedStartLine > originalLines.length) {
        return {
          currentContent,
          newContent: '',
          error: {
            display: `Invalid startLine: ${startLine}. File only has ${originalLines.length} lines.`,
            raw: `Invalid startLine: ${startLine}. File only has ${originalLines.length} lines.`,
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
          isNewFile,
        };
      }

      newLines.push(
        ...originalLines.slice(lastLineProcessed, zeroBasedStartLine),
      );
      const flattenedContent = (contentToAdd || []).flat(Infinity);
      newLines.push(...flattenedContent);
      lastLineProcessed = Math.min(
        zeroBasedStartLine + linesToDelete,
        originalLines.length,
      );
    }

    newLines.push(...originalLines.slice(lastLineProcessed));
    let finalContent = newLines.join('\n');

    if (hadTrailingNewline && !finalContent.endsWith('\n')) {
      finalContent += '\n';
    } else if (!hadTrailingNewline && finalContent.endsWith('\n')) {
      if (finalContent.length > 1) {
        finalContent = finalContent.slice(0, -1);
      }
    }

    return {
      currentContent,
      newContent: finalContent,
      isNewFile,
    };
  }

  async shouldConfirmExecute(
    params: RemoveAddLinesEditorParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }
    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(
        `[RemoveAddLinesEditor] Attempted confirmation with invalid parameters: ${validationError}`,
      );
      return false;
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params);
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

  getDescription(params: RemoveAddLinesEditorParams): string {
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    return `Apply ${params.edits.length} edits to ${shortenPath(relativePath)}`;
  }

  async execute(
    params: RemoveAddLinesEditorParams,
    _signal: AbortSignal,
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
      editData = await this.calculateEdit(params);
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
      await fs.writeFile(params.file_path, editData.newContent, 'utf8');

      let displayResult: ToolResultDisplay;
      if (editData.isNewFile) {
        displayResult = `Created ${shortenPath(makeRelative(params.file_path, this.config.getTargetDir()))}`;
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
          : `Successfully modified file: ${params.file_path} (${params.edits.length} edits).`,
      ];
      if (params.modified_by_user) {
        llmSuccessMessageParts.push(`User modified the edits.`);
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

  private ensureParentDirectoriesExist(filePath: string): void {
    const dirName = path.dirname(filePath);
    try {
      if (!existsSync(dirName)) {
        mkdirSync(dirName, { recursive: true });
      }
    } catch (_e) {
      // ignore
    }
  }
}
