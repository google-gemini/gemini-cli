/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';

/**
 * Parameters for the LS tool
 */
export interface LSToolParams {
  /**
   * The absolute path to the directory to list
   */
  path: string;

  /**
   * List of glob patterns to ignore
   */
  ignore?: string[];
}

/**
 * File entry returned by LS tool
 */
export interface FileEntry {
  /**
   * Name of the file or directory
   */
  name: string;

  /**
   * Absolute path to the file or directory
   */
  path: string;

  /**
   * Whether this entry is a directory
   */
  isDirectory: boolean;

  /**
   * Size of the file in bytes (0 for directories)
   */
  size: number;

  /**
   * Last modified timestamp
   */
  modifiedTime: Date;
}

/**
 * Implementation of the LS tool that lists directory contents
 */
export class LSTool extends BaseTool<LSToolParams, ToolResult> {
  /**
   * The root directory that this tool is grounded in.
   * All path operations will be restricted to this directory.
   */
  private rootDirectory: string;

  /**
   * Creates a new instance of the LSTool
   * @param rootDirectory Root directory to ground this tool in. All operations will be restricted to this directory.
   */
  constructor(rootDirectory: string) {
    super(
      'list_directory',
      'ReadFolder',
      'Lists the names of files and subdirectories directly within a specified directory path. Can optionally ignore entries matching provided glob patterns.',
      {
        properties: {
          path: {
            description:
              'The absolute path to the directory to list (must be absolute, not relative)',
            type: 'string',
          },
          ignore: {
            description: 'List of glob patterns to ignore',
            items: {
              type: 'string',
            },
            type: 'array',
          },
        },
        required: ['path'],
        type: 'object',
      },
    );

    // Set the root directory
    this.rootDirectory = path.resolve(rootDirectory);
  }

  /**
   * Checks if a path is within the root directory
   * @param dirpath The path to check
   * @returns True if the path is within the root directory, false otherwise
   */
  private isWithinRoot(dirpath: string): boolean {
    const normalizedPath = path.normalize(dirpath);
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
   * Validates the parameters for the tool
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  validateToolParams(params: LSToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }
    if (!path.isAbsolute(params.path)) {
      return `Path must be absolute: ${params.path}`;
    }
    if (!this.isWithinRoot(params.path)) {
      return `Path must be within the root directory (${this.rootDirectory}): ${params.path}`;
    }
    return null;
  }

  /**
   * Checks if a filename matches any of the ignore patterns
   * @param filename Filename to check
   * @param patterns Array of glob patterns to check against
   * @returns True if the filename should be ignored
   */
  private shouldIgnore(filename: string, patterns?: string[]): boolean {
    if (!patterns || patterns.length === 0) {
      return false;
    }
    for (const pattern of patterns) {
      // Convert glob pattern to RegExp
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(filename)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets a description of the file reading operation
   * @param params Parameters for the file reading
   * @returns A string describing the file being read
   */
  getDescription(params: LSToolParams): string {
    const relativePath = makeRelative(params.path, this.rootDirectory);
    return shortenPath(relativePath);
  }

  private errorResult(llmContent: string, returnDisplay: string): ToolResult {
    return {
      llmContent,
      returnDisplay: `**Error:** ${returnDisplay}`,
    };
  }

  /**
   * Executes the LS operation with the given parameters
   * @param params Parameters for the LS operation
   * @returns Result of the LS operation
   */
  async execute(params: LSToolParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return this.errorResult(
        `Error: Invalid parameters provided. Reason: ${validationError}`,
        `Failed to execute tool.`,
      );
    }

    try {
      const stats = fs.statSync(params.path);
      if (!stats) {
        return this.errorResult(
          `Directory does not exist: ${params.path}`,
          `Directory does not exist.`,
        );
      }
      if (!stats.isDirectory()) {
        return this.errorResult(
          `Path is not a directory: ${params.path}`,
          `Path is not a directory.`,
        );
      }

      const files = fs.readdirSync(params.path);
      const entries: FileEntry[] = [];
      if (files.length === 0) {
        return this.errorResult(
          `Directory is empty: ${params.path}`,
          `Directory is empty.`,
        );
      }

      for (const file of files) {
        if (this.shouldIgnore(file, params.ignore)) {
          continue;
        }

        const fullPath = path.join(params.path, file);
        try {
          const stats = fs.statSync(fullPath);
          const isDir = stats.isDirectory();
          entries.push({
            name: file,
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? 0 : stats.size,
            modifiedTime: stats.mtime,
          });
        } catch (error) {
          console.error(`Error accessing ${fullPath}: ${error}`);
        }
      }

      // Sort entries (directories first, then alphabetically)
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      // Create formatted content for display
      const directoryContent = entries
        .map((entry) => {
          const typeIndicator = entry.isDirectory ? 'd' : '-';
          const sizeInfo = entry.isDirectory ? '' : ` (${entry.size} bytes)`;
          return `${typeIndicator} ${entry.name}${sizeInfo}`;
        })
        .join('\n');

      return {
        llmContent: `Directory listing for ${params.path}:\n${directoryContent}`,
        returnDisplay: `Found ${entries.length} item(s).`,
      };
    } catch (error) {
      return this.errorResult(
        `Error listing directory: ${error instanceof Error ? error.message : String(error)}`,
        'Failed to list directory.',
      );
    }
  }
}
