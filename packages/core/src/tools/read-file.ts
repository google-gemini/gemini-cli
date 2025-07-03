/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { BaseTool, ToolResult } from './tools.js';
import {
  isWithinRoot,
  processSingleFileContent,
  getSpecificMimeType,
} from '../utils/fileUtils.js';
import { Config } from '../config/config.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';

/**
 * Parameters for the ReadFile tool
 */
export interface ReadFileToolParams {
  /**
   * The absolute path(s) to the file(s) to read. Can be a single path or an array of paths.
   */
  absolute_path: string | string[];

  /**
   * A string specifying a range of lines to read (e.g., '10-20'). This is 1-based.
   */
  lines?: string;

  /**
   * For text files, the name of a section (e.g., a function name) to read.
   */
  section?: string;

  /**
   * The line number to start reading from (optional)
   */
  offset?: number;

  /**
   * The number of lines to read (optional)
   */
  limit?: number;

  /**
   * Precede each line of output with the line number.
   */
  line_numbers?: boolean;

  /**
   * Number non-blank output lines.
   */
  nonblank_numbers?: boolean;

  /**
   * Display a `$` at the end of each line.
   */
  show_ends?: boolean;
}

/**
 * Implementation of the ReadFile tool logic
 */
export class ReadFileTool extends BaseTool<ReadFileToolParams, ToolResult> {
  static readonly Name: string = 'read_file';

  constructor(
    private rootDirectory: string,
    private config: Config,
  ) {
    super(
      ReadFileTool.Name,
      'ReadFile',
      'Reads and returns the content of a specified file from the local filesystem. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), and PDF files. For text files, it can read specific line ranges or sections.',
      {
        properties: {
          absolute_path: {
            description:
              "The absolute path(s) to the file(s) to read (e.g., '/home/user/project/file.txt'). Relative paths are not supported. You must provide absolute path(s).",
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          lines: {
            description:
              "Optional: A string specifying a range of lines to read (e.g., '10-20'). This is 1-based.",
            type: 'string',
            pattern: '^\\d+(-\\d+)?$',
          },
          section: {
            description:
              'Optional: For text files, the name of a section (e.g., a function name) to read. The tool will attempt to find the section and return its content.',
            type: 'string',
          },
          offset: {
            description:
              "Optional (legacy): For text files, the 0-based line number to start reading from. Requires 'limit' to be set. Prefer using the 'lines' parameter. Use for paginating through large files.",
            type: 'number',
          },
          limit: {
            description:
              "Optional (legacy): For text files, maximum number of lines to read. Use with 'offset' to paginate through large files. Prefer using the 'lines' parameter. If omitted, reads the entire file (if feasible, up to a default limit).",
            type: 'number',
          },
          line_numbers: {
            description:
              'Optional: Precede each line of output with the line number.',
            type: 'boolean',
          },
          nonblank_numbers: {
            description: 'Optional: Number non-blank output lines.',
            type: 'boolean',
          },
          show_ends: {
            description: 'Optional: Display a `$` at the end of each line.',
            type: 'boolean',
          },
        },
        required: ['absolute_path'],
        type: 'object',
      },
    );
    this.rootDirectory = path.resolve(rootDirectory);
  }

  validateToolParams(params: ReadFileToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }
    const filePath = params.absolute_path;
    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute, but was relative: ${filePath}. You must provide an absolute path.`;
    }
    if (!isWithinRoot(filePath, this.rootDirectory)) {
      return `File path must be within the root directory (${this.rootDirectory}): ${filePath}`;
    }
    if (params.offset !== undefined && params.offset < 0) {
      return 'Offset must be a non-negative number';
    }
    if (params.limit !== undefined && params.limit <= 0) {
      return 'Limit must be a positive number';
    }

    const fileService = this.config.getFileService();
    if (fileService.shouldGeminiIgnoreFile(params.absolute_path)) {
      const relativePath = makeRelative(
        params.absolute_path,
        this.rootDirectory,
      );
      return `File path '${shortenPath(relativePath)}' is ignored by .geminiignore pattern(s).`;
    }

    return null;
  }

  getDescription(params: ReadFileToolParams): string {
    if (
      !params ||
      typeof params.absolute_path !== 'string' ||
      params.absolute_path.trim() === ''
    ) {
      return `Path unavailable`;
    }
    const relativePath = makeRelative(params.absolute_path, this.rootDirectory);
    return shortenPath(relativePath);
  }

  async execute(
    params: ReadFileToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    const filePaths = Array.isArray(params.absolute_path)
      ? params.absolute_path
      : [params.absolute_path];
    let combinedLlmContent = '';
    let combinedReturnDisplay = '';

    for (const filePath of filePaths) {
      // Permission check
      const permissionService = this.config.getFilePermissionService();
      if (!permissionService.canPerformOperation(filePath, 'read')) {
        const relativePath = makeRelative(filePath, this.rootDirectory);
        const errorMessage = `Read operation on file '${shortenPath(
          relativePath,
        )}' denied by file permission configuration.`;
        return {
          llmContent: `Error: ${errorMessage}`,
          returnDisplay: `Error: ${errorMessage}`,
        };
      }

      const {
        lines,
        section,
        offset,
        limit,
        line_numbers,
        nonblank_numbers,
        show_ends,
      } = params;
      if ((lines && section) || (lines && offset) || (section && offset)) {
        const errorMsg =
          'The `lines`, `section`, and `offset`/`limit` parameters are mutually exclusive.';
        return {
          llmContent: `Error: ${errorMsg}`,
          returnDisplay: `Error: ${errorMsg}`,
        };
      }

      let readOffset: number | undefined = offset;
      let readLimit: number | undefined = limit;

      if (lines) {
        const parts = lines.split('-');
        const start = parseInt(parts[0], 10);
        const end = parts.length > 1 ? parseInt(parts[1], 10) : start;
        if (isNaN(start) || isNaN(end) || start <= 0 || end < start) {
          const errorMsg =
            "Invalid line range format. Use 'start' or 'start-end'. Lines are 1-based.";
          return {
            llmContent: `Error: ${errorMsg}`,
            returnDisplay: `Error: ${errorMsg}`,
          };
        }
        readOffset = start - 1;
        readLimit = end - start + 1;
      }

      if (section) {
        const fileContentResult = await processSingleFileContent(
          filePath,
          this.rootDirectory,
        );

        if (
          fileContentResult.error ||
          typeof fileContentResult.llmContent !== 'string'
        ) {
          return {
            llmContent:
              fileContentResult.error || 'Could not read file to find section.',
            returnDisplay:
              fileContentResult.returnDisplay || 'Could not read file.',
          };
        }

        const fileContent = fileContentResult.llmContent;
        const fileLines = fileContent.split('\n');

        const sectionRegex = new RegExp(
          `(function\\s+${section}|const\\s+${section}\\s*=\\s*function|let\\s+${section}\\s*=\\s*function|var\\s+${section}\\s*=\\s*function)`,
        );
        let startLine = -1;
        for (let i = 0; i < fileLines.length; i++) {
          if (sectionRegex.test(fileLines[i])) {
            startLine = i;
            break;
          }
        }

        if (startLine === -1) {
          const errorMsg = `Section '${section}' not found in file.`;
          return {
            llmContent: `Error: ${errorMsg}`,
            returnDisplay: `Error: ${errorMsg}`,
          };
        }

        let braceCount = 0;
        let endLine = -1;
        let foundFirstBrace = false;
        for (let i = startLine; i < fileLines.length; i++) {
          for (const char of fileLines[i]) {
            if (char === '{') {
              braceCount++;
              foundFirstBrace = true;
            } else if (char === '}') {
              braceCount--;
            }
          }
          if (foundFirstBrace && braceCount === 0) {
            endLine = i;
            break;
          }
        }

        if (endLine === -1) {
          const oneLinerRegex = new RegExp(
            `(const\\s+${section}\\s*=\\s*\\(.*\\)\\s*=>)`,
          );
          if (oneLinerRegex.test(fileLines[startLine])) {
            endLine = startLine;
          } else {
            const errorMsg = `Could not find end of section '${section}'.`;
            return {
              llmContent: `Error: ${errorMsg}`,
              returnDisplay: `Error: ${errorMsg}`,
            };
          }
        }

        const sectionContent = fileLines
          .slice(startLine, endLine + 1)
          .join('\n');

        recordFileOperationMetric(
          this.config,
          FileOperation.READ,
          endLine - startLine + 1,
          getSpecificMimeType(filePath),
          path.extname(filePath),
        );

        combinedLlmContent += `Content of section '${section}' in ${filePath}:\n${sectionContent}\n`;
        combinedReturnDisplay += `Content of section '${section}' in ${filePath}:\n${sectionContent}\n`;
        continue;
      }

      const result = await processSingleFileContent(
        filePath,
        this.rootDirectory,
        readOffset,
        readLimit,
      );

      if (result.error) {
        return {
          llmContent: result.error, // The detailed error for LLM
          returnDisplay: result.returnDisplay, // User-friendly error
        };
      }

      let content =
        typeof result.llmContent === 'string' ? result.llmContent : '';
      if (line_numbers) {
        content = content
          .split('\n')
          .map((line, index) => `${index + 1}: ${line}`)
          .join('\n');
      }
      if (nonblank_numbers) {
        let blank_count = 0;
        content = content
          .split('\n')
          .map((line, index) => {
            if (line.trim() === '') {
              blank_count++;
              return '';
            }
            return `${index + 1 - blank_count}: ${line}`;
          })
          .join('\n');
      }
      if (show_ends) {
        content = content.replace(/\n/g, '$\n');
      }

      const resultLines =
        typeof result.llmContent === 'string'
          ? result.llmContent.split('\n').length
          : undefined;
      const mimetype = getSpecificMimeType(filePath);
      recordFileOperationMetric(
        this.config,
        FileOperation.READ,
        resultLines,
        mimetype,
        path.extname(filePath),
      );

      combinedLlmContent += `Content of ${filePath}:\n${content}\n`;
      combinedReturnDisplay += `Content of ${filePath}:\n${content}\n`;
    }

    return {
      llmContent: combinedLlmContent,
      returnDisplay: combinedReturnDisplay,
    };
  }
}
