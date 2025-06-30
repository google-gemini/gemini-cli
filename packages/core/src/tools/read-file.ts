/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
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
import { logger } from '../core/logger.js';

/**
 * Parameters for the ReadFile tool
 */
export interface ReadFileToolParams {
  /**
   * The absolute path to the file to read
   */
  absolute_path: string;

  /**
   * The line number to start reading from (optional)
   */
  offset?: number;

  /**
   * The number of lines to read (optional)
   */
  limit?: number;

  /**
   * Optional: For text files, the 0-based line number to start reading from.
   */
  start_line?: number;

  /**
   * Optional: For text files, the 0-based line number to end reading at (inclusive).
   */
  end_line?: number;

  /**
   * Optional: A regular expression pattern to filter lines by.
   */
  pattern?: string;

  /**
   * Optional: The 0-based byte offset to start reading from.
   */
  start_byte?: number;

  /**
   * Optional: The 0-based byte offset to end reading at (exclusive).
   */
  end_byte?: number;

  /**
   * Optional: The character encoding to use for text files (e.g., 'utf-8', 'latin-1').
   */
  encoding?: string;
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
      'Reads and returns the content of a specified file from the local filesystem. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), and PDF files. For text files, it can read specific line ranges.',
      {
        properties: {
          absolute_path: {
            description:
              "The absolute path to the file to read (e.g., '/home/user/project/file.txt'). Relative paths are not supported. You must provide an absolute path.",
            type: 'string',
            pattern: '^/',
          },
          offset: {
            description:
              "Optional: For text files, the 0-based line number to start reading from. Requires 'limit' to be set. Use for paginating through large files.",
            type: 'number',
          },
          limit: {
            description:
              "Optional: For text files, maximum number of lines to read. Use with 'offset' to paginate through large files. If omitted, reads the entire file (if feasible, up to a default limit).",
            type: 'number',
          },
          start_line: {
            description:
              'Optional: For text files, the 0-based line number to start reading from.',
            type: 'number',
          },
          end_line: {
            description:
              'Optional: For text files, the 0-based line number to end reading at (inclusive).',
            type: 'number',
          },
          pattern: {
            description:
              'Optional: A regular expression pattern to filter lines by.',
            type: 'string',
          },
          start_byte: {
            description:
              'Optional: The 0-based byte offset to start reading from.',
            type: 'number',
          },
          end_byte: {
            description:
              'Optional: The 0-based byte offset to end reading at (exclusive).',
            type: 'number',
          },
          encoding: {
            description:
              "Optional: The character encoding to use for text files (e.g., 'utf-8', 'latin-1').",
            type: 'string',
          },
        },
        required: ['absolute_path'],
        type: 'object',
      },
    );
    this.rootDirectory = path.resolve(rootDirectory);
  }

  override validateToolParams(params: ReadFileToolParams): string | null {
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
    if (params.start_line !== undefined && params.start_line < 0) {
      return 'Start line must be a non-negative number';
    }
    if (params.end_line !== undefined && params.end_line < 0) {
      return 'End line must be a non-negative number';
    }
    if (
      params.start_line !== undefined &&
      params.end_line !== undefined &&
      params.start_line > params.end_line
    ) {
      return 'Start line cannot be greater than end line';
    }
    if (params.start_byte !== undefined && params.start_byte < 0) {
      return 'Start byte must be a non-negative number';
    }
    if (params.end_byte !== undefined && params.end_byte < 0) {
      return 'End byte must be a non-negative number';
    }
    if (
      params.start_byte !== undefined &&
      params.end_byte !== undefined &&
      params.start_byte > params.end_byte
    ) {
      return 'Start byte cannot be greater than end byte';
    }
    if (params.pattern) {
      try {
        new RegExp(params.pattern);
      } catch (e: unknown) {
        return `Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}`;
      }
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

  override getDescription(params: ReadFileToolParams): string {
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
    logger.info(`Executing read_file command for: ${params.absolute_path}`);
    logger.debug(`Read file parameters: ${JSON.stringify(params)}`);

    const validationError = this.validateToolParams(params);
    if (validationError) {
      logger.error(`Read file validation failed: ${validationError}`);
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    const {
      absolute_path,
      offset,
      limit,
      start_line,
      end_line,
      pattern,
      start_byte,
      end_byte,
      encoding,
    } = params;

    // Handle byte range reading first
    if (start_byte !== undefined && end_byte !== undefined) {
      logger.debug(`Attempting to read file by byte range: ${start_byte}-${end_byte}`);
      try {
        const buffer = Buffer.alloc(end_byte - start_byte);
        const fd = await fs.open(absolute_path, 'r');
        try {
          await fd.read(buffer, 0, buffer.length, start_byte);
          logger.info(`Successfully read ${buffer.length} bytes from ${shortenPath(absolute_path)}`);
          return {
            llmContent: buffer.toString(encoding as BufferEncoding),
            returnDisplay: `Read ${buffer.length} bytes from ${shortenPath(absolute_path)}`,
          };
        } finally {
          await fd.close();
          logger.debug('File descriptor closed after byte range read.');
        }
      } catch (e: unknown) {
        logger.error(`Error reading file by byte range: ${getErrorMessage(e)}`, e);
        return {
          llmContent: `Error reading file by byte range: ${getErrorMessage(e)}`,
          returnDisplay: `Error reading file by byte range: ${getErrorMessage(e)}`,
        };
      }
    }

    logger.debug('Processing single file content...');
    const result = await processSingleFileContent(
      absolute_path,
      this.rootDirectory,
      offset,
      limit,
    );

    if (result.error) {
      logger.error(`Error processing single file content: ${result.error}`);
      return {
        llmContent: result.error, // The detailed error for LLM
        returnDisplay: result.returnDisplay, // User-friendly error
      };
    }

    let content = result.llmContent;

    // Apply line range filtering if start_line and end_line are provided
    if (
      typeof content === 'string' &&
      start_line !== undefined &&
      end_line !== undefined
    ) {
      logger.debug(`Applying line range filter: ${start_line}-${end_line}`);
      const lines = content.split('\n');
      content = lines.slice(start_line, end_line + 1).join('\n');
    }

    // Apply content pattern filtering
    if (typeof content === 'string' && pattern) {
      logger.debug(`Applying pattern filter: ${pattern}`);
      try {
        const regex = new RegExp(pattern);
        content = content
          .split('\n')
          .filter((line) => regex.test(line))
          .join('\n');
      } catch (e: unknown) {
        logger.error(`Invalid regex pattern in read_file: ${getErrorMessage(e)}`, e);
        return {
          llmContent: `Error: Invalid regex pattern provided. Reason: ${getErrorMessage(e)}`,
          returnDisplay: `Error: Invalid regex pattern provided.`,
        };
      }
    }

    const linesCount =
      typeof content === 'string' ? content.split('\n').length : undefined;
    const mimetype = getSpecificMimeType(absolute_path);
    recordFileOperationMetric(
      this.config,
      FileOperation.READ,
      linesCount,
      mimetype,
      path.extname(absolute_path),
    );
    logger.info(`File read operation complete for ${shortenPath(absolute_path)}.`);
    logger.debug(`Content length: ${content?.length || 0}, Lines: ${linesCount || 'N/A'}`);

    return {
      llmContent: content,
      returnDisplay: result.returnDisplay,
    };
  }
}
