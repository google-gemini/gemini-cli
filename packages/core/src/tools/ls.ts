/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { BaseTool, Icon, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { Config, DEFAULT_FILE_FILTERING_OPTIONS } from '../config/config.js';

/**
 * Parameters for the LS tool
 */
export interface LSToolParams {
  /**
   * The absolute path to the directory to list
   */
  path: string;

  /**
   * Array of glob patterns to ignore (optional)
   */
  ignore?: string[];

  /**
   * Whether to respect .gitignore and .geminiignore patterns (optional, defaults to true)
   */
  file_filtering_options?: {
    respect_git_ignore?: boolean;
    respect_gemini_ignore?: boolean;
  };
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
 * Implementation of the LS tool logic
 */
export class LSTool extends BaseTool<LSToolParams, ToolResult> {
  static readonly Name = 'list_directory';

  constructor(private config: Config) {
    super(
      LSTool.Name,
      'ReadFolder',
      'Lists the names of files and subdirectories directly within a specified directory path. Can optionally ignore entries matching provided glob patterns.',
      Icon.Folder,
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
          file_filtering_options: {
            description:
              'Optional: Whether to respect ignore patterns from .gitignore or .geminiignore',
            type: 'object',
            properties: {
              respect_git_ignore: {
                description:
                  'Optional: Whether to respect .gitignore patterns when listing files. Only available in git repositories. Defaults to true.',
                type: 'boolean',
              },
              respect_gemini_ignore: {
                description:
                  'Optional: Whether to respect .geminiignore patterns when listing files. Defaults to true.',
                type: 'boolean',
              },
            },
          },
        },
        required: ['path'],
        type: 'object',
      },
    );
  }

  /**
   * Validates the parameters for the tool
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  validateToolParams(params: LSToolParams): string | null {
    const errors = SchemaValidator.validate(
      this.schema.parametersJsonSchema,
      params,
    );
    if (errors) {
      return errors;
    }
    if (!path.isAbsolute(params.path)) {
      return `Path must be absolute: ${params.path}`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(params.path)) {
      const directories = workspaceContext.getDirectories();
      return `Path must be within one of the workspace directories: ${directories.join(', ')}`;
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
    const relativePath = makeRelative(params.path, this.config.getTargetDir());
    return shortenPath(relativePath);
  }

  // Helper for consistent error formatting
  private errorResult(llmContent: string, returnDisplay: string): ToolResult {
    return {
      llmContent,
      // Keep returnDisplay simpler in core logic
      returnDisplay: `Error: ${returnDisplay}`,
    };
  }

  /**
   * Executes the LS operation with the given parameters
   * @param params Parameters for the LS operation
   * @returns Result of the LS operation
   */
  async execute(
    params: LSToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
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
        // fs.statSync throws on non-existence, so this check might be redundant
        // but keeping for clarity. Error message adjusted.
        return this.errorResult(
          `Error: Directory not found or inaccessible: ${params.path}`,
          `Directory not found or inaccessible.`,
        );
      }
      if (!stats.isDirectory()) {
        return this.errorResult(
          `Error: Path is not a directory: ${params.path}`,
          `Path is not a directory.`,
        );
      }

      const files = fs.readdirSync(params.path);

      const defaultFileIgnores =
        this.config.getFileFilteringOptions() ?? DEFAULT_FILE_FILTERING_OPTIONS;

      const fileFilteringOptions = {
        respectGitIgnore:
          params.file_filtering_options?.respect_git_ignore ??
          defaultFileIgnores.respectGitIgnore,
        respectGeminiIgnore:
          params.file_filtering_options?.respect_gemini_ignore ??
          defaultFileIgnores.respectGeminiIgnore,
      };

      // Get centralized file discovery service

      const fileDiscovery = this.config.getFileService();

      const entries: FileEntry[] = [];
      let gitIgnoredCount = 0;
      let geminiIgnoredCount = 0;

      if (files.length === 0) {
        // Changed error message to be more neutral for LLM
        return {
          llmContent: `Directory ${params.path} is empty.`,
          returnDisplay: `Directory is empty.`,
        };
      }

      for (const file of files) {
        if (this.shouldIgnore(file, params.ignore)) {
          continue;
        }

        const fullPath = path.join(params.path, file);
        const relativePath = path.relative(
          this.config.getTargetDir(),
          fullPath,
        );

        // Check if this file should be ignored based on git or gemini ignore rules
        if (
          fileFilteringOptions.respectGitIgnore &&
          fileDiscovery.shouldGitIgnoreFile(relativePath)
        ) {
          gitIgnoredCount++;
          continue;
        }
        if (
          fileFilteringOptions.respectGeminiIgnore &&
          fileDiscovery.shouldGeminiIgnoreFile(relativePath)
        ) {
          geminiIgnoredCount++;
          continue;
        }

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
          // Log error internally but don't fail the whole listing
          console.error(`Error accessing ${fullPath}: ${error}`);
        }
      }

      // Sort entries (directories first, then alphabetically)
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      // Create formatted content for LLM
      const directoryContent = entries
        .map((entry) => `${entry.isDirectory ? '[DIR] ' : ''}${entry.name}`)
        .join('\n');

      let resultMessage = `Directory listing for ${params.path}:\n${directoryContent}`;
      const ignoredMessages = [];
      if (gitIgnoredCount > 0) {
        ignoredMessages.push(`${gitIgnoredCount} git-ignored`);
      }
      if (geminiIgnoredCount > 0) {
        ignoredMessages.push(`${geminiIgnoredCount} gemini-ignored`);
      }

      if (ignoredMessages.length > 0) {
        resultMessage += `\n\n(${ignoredMessages.join(', ')})`;
      }

      let displayMessage = `Listed ${entries.length} item(s).`;
      if (ignoredMessages.length > 0) {
        displayMessage += ` (${ignoredMessages.join(', ')})`;
      }

      return {
        llmContent: resultMessage,
        returnDisplay: displayMessage,
      };
    } catch (error) {
      const errorMsg = `Error listing directory: ${error instanceof Error ? error.message : String(error)}`;
      return this.errorResult(errorMsg, 'Failed to list directory.');
    }
  }
}
