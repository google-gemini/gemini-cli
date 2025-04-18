import fs from 'fs';
import path from 'path';
import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
} from '../ui/types.js';
import * as Diff from 'diff';

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
}

/**
 * Implementation of the WriteFile tool that writes files to the filesystem
 */
export class WriteFileTool extends BaseTool<
  WriteFileToolParams,
  ToolResult
> {
  static readonly Name: string = 'write_file';
  private shouldAlwaysWrite = false;

  /**
   * The root directory that this tool is grounded in.
   * All file operations will be restricted to this directory.
   */
  private rootDirectory: string;

  /**
   * Creates a new instance of the WriteFileTool
   * @param rootDirectory Root directory to ground this tool in. All operations will be restricted to this directory.
   */
  constructor(rootDirectory: string) {
    super(
      WriteFileTool.Name,
      'WriteFile',
      'Writes content to a specified file in the local filesystem.',
      {
        properties: {
          filePath: {
            description:
              "The absolute path to the file to write to (e.g., '/home/user/project/file.txt'). Relative paths are not supported.",
            type: 'string',
          },
          content: {
            description: 'The content to write to the file.',
            type: 'string',
          },
        },
        required: ['filePath', 'content'],
        type: 'object',
      },
    );

    // Set the root directory
    this.rootDirectory = path.resolve(rootDirectory);
  }

  /**
   * Checks if a path is within the root directory
   * @param pathToCheck The path to check
   * @returns True if the path is within the root directory, false otherwise
   */
  private isWithinRoot(pathToCheck: string): boolean {
    const normalizedPath = path.normalize(pathToCheck);
    const normalizedRoot = path.normalize(this.rootDirectory);

    // Ensure the normalizedRoot ends with a path separator for proper path comparison
    const rootWithSep = normalizedRoot.endsWith(path.sep)
      ? normalizedRoot
      : normalizedRoot + path.sep;

    return (
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(rootWithSep)
    );
  }

  /**
   * Validates the parameters for the WriteFile tool
   * @param params Parameters to validate
   * @returns True if parameters are valid, false otherwise
   */
  validateToolParams(params: WriteFileToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }

    // Ensure path is absolute
    if (!path.isAbsolute(params.file_path)) {
      return `File path must be absolute: ${params.file_path}`;
    }

    // Ensure path is within the root directory
    if (!this.isWithinRoot(params.file_path)) {
      return `File path must be within the root directory (${this.rootDirectory}): ${params.file_path}`;
    }

    return null;
  }

  /**
   * Determines if the tool should prompt for confirmation before execution
   * @param params Parameters for the tool execution
   * @returns Whether or not execute should be confirmed by the user.
   */
  async shouldConfirmExecute(
    params: WriteFileToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.shouldAlwaysWrite) {
      return false;
    }

    const relativePath = makeRelative(params.file_path, this.rootDirectory);
    const fileName = path.basename(params.file_path);

    let currentContent = '';
    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
    } catch {
      // File may not exist, which is fine
    }

    const fileDiff = Diff.createPatch(
      fileName,
      currentContent,
      params.content,
      'Current',
      'Proposed',
      { context: 3, ignoreWhitespace: true },
    );

    const confirmationDetails: ToolEditConfirmationDetails = {
      title: `Confirm Write: ${shortenPath(relativePath)}`,
      fileName,
      fileDiff,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.shouldAlwaysWrite = true;
        }
      },
    };
    return confirmationDetails;
  }

  /**
   * Gets a description of the file writing operation
   * @param params Parameters for the file writing
   * @returns A string describing the file being written to
   */
  getDescription(params: WriteFileToolParams): string {
    const relativePath = makeRelative(params.file_path, this.rootDirectory);
    return `Writing to ${shortenPath(relativePath)}`;
  }

  /**
   * Executes the file writing operation
   * @param params Parameters for the file writing
   * @returns Result of the file writing operation
   */
  async execute(params: WriteFileToolParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: '**Error:** Failed to execute tool.',
      };
    }

    try {
      // Ensure parent directories exist
      const dirName = path.dirname(params.file_path);
      if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
      }

      // Write the file
      fs.writeFileSync(params.file_path, params.content, 'utf8');

      return {
        llmContent: `Successfully wrote to file: ${params.file_path}`,
        returnDisplay: `Wrote to ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`,
      };
    } catch (error) {
      const errorMsg = `Error writing to file: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: `Error writing to file ${params.file_path}: ${errorMsg}`,
        returnDisplay: `Failed to write to file: ${errorMsg}`,
      };
    }
  }
}
