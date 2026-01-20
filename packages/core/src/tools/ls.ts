/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import type { Config } from '../config/config.js';
import { DEFAULT_FILE_FILTERING_OPTIONS } from '../config/constants.js';
import { ToolErrorType } from './tool-error.js';
import { LS_TOOL_NAME } from './tool-names.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Parameters for the LS tool
 */
export interface LSToolParams {
  /**
   * The absolute path to the directory to list
   */
  dir_path: string;

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

class LSToolInvocation extends BaseToolInvocation<LSToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    params: LSToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
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
   * @returns A string describing the file being read
   */
  getDescription(): string {
    const relativePath = makeRelative(
      this.params.dir_path,
      this.config.getTargetDir(),
    );
    return shortenPath(relativePath);
  }

  // Helper for consistent error formatting
  private errorResult(
    llmContent: string,
    returnDisplay: string,
    type: ToolErrorType,
  ): ToolResult {
    return {
      llmContent,
      // Keep returnDisplay simpler in core logic
      returnDisplay: `Error: ${returnDisplay}`,
      error: {
        message: llmContent,
        type,
      },
    };
  }

  /**
   * Executes the LS operation with the given parameters
   * @returns Result of the LS operation
   */
  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const resolvedDirPath = path.resolve(
      this.config.getTargetDir(),
      this.params.dir_path,
    );
    try {
      const stats = await fs.stat(resolvedDirPath);
      if (!stats) {
        // fs.statSync throws on non-existence, so this check might be redundant
        // but keeping for clarity. Error message adjusted.
        return this.errorResult(
          `Error: Directory not found or inaccessible: ${resolvedDirPath}`,
          `Directory not found or inaccessible.`,
          ToolErrorType.FILE_NOT_FOUND,
        );
      }
      if (!stats.isDirectory()) {
        return this.errorResult(
          `Error: Path is not a directory: ${resolvedDirPath}`,
          `Path is not a directory.`,
          ToolErrorType.PATH_IS_NOT_A_DIRECTORY,
        );
      }

      const files = await fs.readdir(resolvedDirPath);
      if (files.length === 0) {
        // Changed error message to be more neutral for LLM
        return {
          llmContent: `Directory ${resolvedDirPath} is empty.`,
          returnDisplay: `Directory is empty.`,
        };
      }

      const relativePaths = files.map((file) =>
        path.relative(
          this.config.getTargetDir(),
          path.join(resolvedDirPath, file),
        ),
      );

      const fileDiscovery = this.config.getFileService();
      const { filteredPaths, ignoredCount } =
        fileDiscovery.filterFilesWithReport(relativePaths, {
          respectGitIgnore:
            this.params.file_filtering_options?.respect_git_ignore ??
            this.config.getFileFilteringOptions().respectGitIgnore ??
            DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore,
          respectGeminiIgnore:
            this.params.file_filtering_options?.respect_gemini_ignore ??
            this.config.getFileFilteringOptions().respectGeminiIgnore ??
            DEFAULT_FILE_FILTERING_OPTIONS.respectGeminiIgnore,
        });

      const entries = [];
      for (const relativePath of filteredPaths) {
        const fullPath = path.resolve(this.config.getTargetDir(), relativePath);

        if (this.shouldIgnore(path.basename(fullPath), this.params.ignore)) {
          continue;
        }

        try {
          const stats = await fs.stat(fullPath);
          const isDir = stats.isDirectory();
          entries.push({
            name: path.basename(fullPath),
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? 0 : stats.size,
            modifiedTime: stats.mtime,
          });
        } catch (error) {
          // Log error internally but don't fail the whole listing
          debugLogger.debug(`Error accessing ${fullPath}: ${error}`);
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

      let resultMessage = `Directory listing for ${resolvedDirPath}:\n${directoryContent}`;
      if (ignoredCount > 0) {
        resultMessage += `\n\n(${ignoredCount} ignored)`;
      }

      let displayMessage = `Listed ${entries.length} item(s).`;
      if (ignoredCount > 0) {
        displayMessage += ` (${ignoredCount} ignored)`;
      }

      return {
        llmContent: resultMessage,
        returnDisplay: displayMessage,
      };
    } catch (error) {
      const errorMsg = `Error listing directory: ${error instanceof Error ? error.message : String(error)}`;
      return this.errorResult(
        errorMsg,
        'Failed to list directory.',
        ToolErrorType.LS_EXECUTION_ERROR,
      );
    }
  }
}

/**
 * Implementation of the LS tool logic
 */
export class LSTool extends BaseDeclarativeTool<LSToolParams, ToolResult> {
  static readonly Name = LS_TOOL_NAME;

  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LSTool.Name,
      'ReadFolder',
      'Lists the names of files and subdirectories directly within a specified directory path. Can optionally ignore entries matching provided glob patterns.',
      Kind.Search,
      {
        properties: {
          dir_path: {
            description: 'The path to the directory to list',
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
        required: ['dir_path'],
        type: 'object',
      },
      messageBus,
      true,
      false,
    );
  }

  /**
   * Validates the parameters for the tool
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  protected override validateToolParamValues(
    params: LSToolParams,
  ): string | null {
    const resolvedPath = path.resolve(
      this.config.getTargetDir(),
      params.dir_path,
    );
    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(resolvedPath)) {
      const directories = workspaceContext.getDirectories();
      return `Path must be within one of the workspace directories: ${directories.join(
        ', ',
      )}`;
    }
    return null;
  }

  protected createInvocation(
    params: LSToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<LSToolParams, ToolResult> {
    return new LSToolInvocation(
      this.config,
      params,
      messageBus ?? this.messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
