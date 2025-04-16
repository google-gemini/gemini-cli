import fs from 'fs';
import path from 'path';
import { ToolResult } from './ToolResult.js';
import { BaseTool } from './BaseTool.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';

/**
 * Parameters for the ReadFile tool
 */
export interface ReadFileToolParams {
  /**
   * The absolute path to the file to read
   */
  file_path: string;

  /**
   * The line number to start reading from (optional)
   */
  offset?: number;

  /**
   * The number of lines to read (optional)
   */
  limit?: number;
}

/**
 * Standardized result from the ReadFile tool
 */
export interface ReadFileToolResult extends ToolResult {
}

/**
 * Implementation of the ReadFile tool that reads files from the filesystem
 */
export class ReadFileTool extends BaseTool<ReadFileToolParams, ReadFileToolResult> {
  public static readonly Name: string = 'read_file';
  
  // Maximum number of lines to read by default
  private static readonly DEFAULT_MAX_LINES = 2000;

  // Maximum length of a line before truncating
  private static readonly MAX_LINE_LENGTH = 2000;

  /**
   * The root directory that this tool is grounded in.
   * All file operations will be restricted to this directory.
   */
  private rootDirectory: string;

  /**
   * Creates a new instance of the ReadFileTool
   * @param rootDirectory Root directory to ground this tool in. All operations will be restricted to this directory.
   */
  constructor(rootDirectory: string) {
    super(
      ReadFileTool.Name,
      'ReadFile',
      'Reads and returns the content of a specified file from the local filesystem. Handles large files by allowing reading specific line ranges.',
      {
        properties: {
          file_path: {
            description: 'The absolute path to the file to read (e.g., \'/home/user/project/file.txt\'). Relative paths are not supported.',
            type: 'string'
          },
          offset: {
            description: 'Optional: The 0-based line number to start reading from. Requires \'limit\' to be set. Use for paginating through large files.',
            type: 'number'
          },
          limit: {
            description: 'Optional: Maximum number of lines to read. Use with \'offset\' to paginate through large files. If omitted, reads the entire file (if feasible).',
            type: 'number'
          }
        },
        required: ['file_path'],
        type: 'object'
      }
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

    return normalizedPath === normalizedRoot || normalizedPath.startsWith(rootWithSep);
  }

  /**
   * Validates the parameters for the ReadFile tool
   * @param params Parameters to validate
   * @returns True if parameters are valid, false otherwise
   */
  invalidParams(params: ReadFileToolParams): string | null {
    if (this.schema.parameters && !SchemaValidator.validate(this.schema.parameters as Record<string, unknown>, params)) {
      return "Parameters failed schema validation.";
    }

    // Ensure path is absolute
    if (!path.isAbsolute(params.file_path)) {
      return `File path must be absolute: ${params.file_path}`;
    }

    // Ensure path is within the root directory
    if (!this.isWithinRoot(params.file_path)) {
      return `File path must be within the root directory (${this.rootDirectory}): ${params.file_path}`;
    }

    // Validate offset and limit if provided
    if (params.offset !== undefined && params.offset < 0) {
      return 'Offset must be a non-negative number';
    }

    if (params.limit !== undefined && params.limit <= 0) {
      return 'Limit must be a positive number';
    }

    return null;
  }

  /**
   * Determines if a file is likely binary based on content sampling
   * @param filePath Path to the file
   * @returns True if the file appears to be binary
   */
  private isBinaryFile(filePath: string): boolean {
    try {
      // Read the first 4KB of the file
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(4096);
      const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
      fs.closeSync(fd);

      // Check for null bytes or high concentration of non-printable characters
      let nonPrintableCount = 0;
      for (let i = 0; i < bytesRead; i++) {
        // Null byte is a strong indicator of binary data
        if (buffer[i] === 0) {
          return true;
        }

        // Count non-printable characters
        if (buffer[i] < 9 || (buffer[i] > 13 && buffer[i] < 32)) {
          nonPrintableCount++;
        }
      }

      // If more than 30% are non-printable, likely binary
      return (nonPrintableCount / bytesRead) > 0.3;
    } catch (error) {
      return false;
    }
  }

  /**
   * Detects the type of file based on extension and content
   * @param filePath Path to the file
   * @returns File type description
   */
  private detectFileType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    // Common image formats
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(ext)) {
      return 'image';
    }

    // Other known binary formats
    if (['.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so'].includes(ext)) {
      return 'binary';
    }

    // Check content for binary indicators
    if (this.isBinaryFile(filePath)) {
      return 'binary';
    }

    return 'text';
  }

  /**
   * Gets a description of the file reading operation
   * @param params Parameters for the file reading
   * @returns A string describing the file being read
   */
  getDescription(params: ReadFileToolParams): string {
      const relativePath = makeRelative(params.file_path, this.rootDirectory);
      return shortenPath(relativePath);
  }

  /**
   * Reads a file and returns its contents with line numbers
   * @param params Parameters for the file reading
   * @returns Result with file contents
   */
  async execute(params: ReadFileToolParams): Promise<ReadFileToolResult> {
    const validationError = this.invalidParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: "**Error:** Failed to execute tool."
      };
    }

    try {
      // Check if file exists
      if (!fs.existsSync(params.file_path)) {
        return {
          llmContent: `File not found: ${params.file_path}`,
          returnDisplay: `File not found.`,
        };
      }

      // Check if it's a directory
      const stats = fs.statSync(params.file_path);
      if (stats.isDirectory()) {
        return {
          llmContent: `Path is a directory, not a file: ${params.file_path}`,
          returnDisplay: `File is directory.`,
        };
      }

      // Detect file type
      const fileType = this.detectFileType(params.file_path);

      // Handle binary files differently
      if (fileType !== 'text') {
        return {
          llmContent: `Binary file: ${params.file_path} (${fileType})`,
          returnDisplay: ``,
        };
      }

      // Read and process text file
      const content = fs.readFileSync(params.file_path, 'utf8');
      const lines = content.split('\n');

      // Apply offset and limit
      const startLine = params.offset || 0;
      // Use the default max lines if no limit is provided
      const endLine = params.limit
        ? startLine + params.limit
        : Math.min(startLine + ReadFileTool.DEFAULT_MAX_LINES, lines.length);
      const selectedLines = lines.slice(startLine, endLine);

      // Format with line numbers and handle line truncation
      let truncated = false;
      const formattedLines = selectedLines.map((line) => {
        // Calculate actual line number (1-based)
        // Truncate long lines
        let processedLine = line;
        if (line.length > ReadFileTool.MAX_LINE_LENGTH) {
          processedLine = line.substring(0, ReadFileTool.MAX_LINE_LENGTH) + '... [truncated]';
          truncated = true;
        }

        return processedLine;
      });

      // Check if content was truncated due to line limit or max lines limit
      const contentTruncated = (endLine < lines.length) || truncated;

      // Create llmContent with truncation info if needed
      let llmContent = '';
      if (contentTruncated) {
        llmContent += `[File truncated: showing lines ${startLine + 1}-${endLine} of ${lines.length} total lines. Use offset parameter to view more.]\n`;
      }
      llmContent += formattedLines.join('\n');

      return {
        llmContent,
        returnDisplay: '',
      };
    } catch (error) {
      const errorMsg = `Error reading file: ${error instanceof Error ? error.message : String(error)}`;

      return {
        llmContent: `Error reading file ${params.file_path}: ${errorMsg}`,
        returnDisplay: `Failed to read file: ${errorMsg}`,
      };
    }
  }
}