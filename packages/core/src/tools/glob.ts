/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { BaseTool, ToolResult } from './tools.js';
import { shortenPath, makeRelative } from '../utils/paths.js';
import { Config } from '../config/config.js';

// Type definition for file entries returned by fast-glob with stats: true
export interface GlobFileEntry {
  path: string;
  stats?: fs.Stats;
}

/**
 * Sorts file entries based on recency and then alphabetically.
 * Recent files (modified within recencyThresholdMs) are listed first, newest to oldest.
 * Older files are listed after recent ones, sorted alphabetically by path.
 */
export function sortFileEntries(
  entries: GlobFileEntry[],
  nowTimestamp: number,
  recencyThresholdMs: number,
): GlobFileEntry[] {
  const sortedEntries = [...entries];
  sortedEntries.sort((a, b) => {
    const mtimeA = a.stats?.mtime?.getTime() ?? 0;
    const mtimeB = b.stats?.mtime?.getTime() ?? 0;
    const aIsRecent = nowTimestamp - mtimeA < recencyThresholdMs;
    const bIsRecent = nowTimestamp - mtimeB < recencyThresholdMs;

    if (aIsRecent && bIsRecent) {
      return mtimeB - mtimeA;
    } else if (aIsRecent) {
      return -1;
    } else if (bIsRecent) {
      return 1;
    } else {
      return a.path.localeCompare(b.path);
    }
  });
  return sortedEntries;
}

/**
 * Parameters for the GlobTool
 */
export interface GlobToolParams {
  /**
   * The glob pattern to match files against
   */
  pattern: string;

  /**
   * The directory to search in (optional, defaults to current directory)
   */
  path?: string;

  /**
   * Whether the search should be case-sensitive (optional, defaults to false)
   */
  case_sensitive?: boolean;

  /**
   * Whether to respect .gitignore patterns (optional, defaults to true)
   */
  respect_git_ignore?: boolean;
}

/**
 * Implementation of the Glob tool logic
 */
export class GlobTool extends BaseTool<GlobToolParams, ToolResult> {
  static readonly Name = 'glob';
  /**
   * Creates a new instance of the GlobLogic
   * @param rootDirectory Root directory to ground this tool in.
   */
  constructor(
    private rootDirectory: string,
    private config: Config,
  ) {
    super(
      GlobTool.Name,
      'FindFiles',
      'Efficiently finds files matching specific glob patterns (e.g., `src/**/*.ts`, `**/*.md`), returning absolute paths sorted by modification time (newest first). Ideal for quickly locating files based on their name or path structure, especially in large codebases.',
      {
        properties: {
          pattern: {
            description:
              "The glob pattern to match against (e.g., '**/*.py', 'docs/*.md').",
            type: 'string',
          },
          path: {
            description:
              'Optional: The absolute path to the directory to search within. If omitted, searches the root directory.',
            type: 'string',
          },
          case_sensitive: {
            description:
              'Optional: Whether the search should be case-sensitive. Defaults to false.',
            type: 'boolean',
          },
          respect_git_ignore: {
            description:
              'Optional: Whether to respect .gitignore patterns when finding files. Only available in git repositories. Defaults to true.',
            type: 'boolean',
          },
        },
        required: ['pattern'],
        type: 'object',
      },
    );

    this.rootDirectory = path.resolve(rootDirectory);
  }

  /**
   * Checks if a path is within the root directory.
   */
  private isWithinRoot(pathToCheck: string): boolean {
    const absolutePathToCheck = path.resolve(pathToCheck);
    const normalizedPath = path.normalize(absolutePathToCheck);
    const normalizedRoot = path.normalize(this.rootDirectory);
    const rootWithSep = normalizedRoot.endsWith(path.sep)
      ? normalizedRoot
      : normalizedRoot + path.sep;
    return (
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(rootWithSep)
    );
  }

  /**
   * Validates the parameters for the tool.
   */
  validateToolParams(params: GlobToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return "Parameters failed schema validation. Ensure 'pattern' is a string, 'path' (if provided) is a string, and 'case_sensitive' (if provided) is a boolean.";
    }

    const searchDirAbsolute = path.resolve(
      this.rootDirectory,
      params.path || '.',
    );

    if (!this.isWithinRoot(searchDirAbsolute)) {
      return `Search path ("${searchDirAbsolute}") resolves outside the tool's root directory ("${this.rootDirectory}").`;
    }

    const targetDir = searchDirAbsolute || this.rootDirectory;
    try {
      if (!fs.existsSync(targetDir)) {
        return `Search path does not exist ${targetDir}`;
      }
      if (!fs.statSync(targetDir).isDirectory()) {
        return `Search path is not a directory: ${targetDir}`;
      }
    } catch (e: unknown) {
      return `Error accessing search path: ${e}`;
    }

    if (
      !params.pattern ||
      typeof params.pattern !== 'string' ||
      params.pattern.trim() === ''
    ) {
      return "The 'pattern' parameter cannot be empty.";
    }

    return null;
  }

  /**
   * Gets a description of the glob operation.
   */
  getDescription(params: GlobToolParams): string {
    let description = `'${params.pattern}'`;
    if (params.path) {
      const searchDir = path.resolve(this.rootDirectory, params.path || '.');
      const relativePath = makeRelative(searchDir, this.rootDirectory);
      description += ` within ${shortenPath(relativePath)}`;
    }
    return description;
  }

  /**
   * Executes the glob search with the given parameters
   */
  async execute(
    params: GlobToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    try {
      const searchDirAbsolute = path.resolve(
        this.rootDirectory,
        params.path || '.',
      );

      // Get centralized file discovery service
      const respectGitIgnore =
        params.respect_git_ignore ??
        this.config.getFileFilteringRespectGitIgnore();
      const fileDiscovery = await this.config.getFileService();

      const entries = await fg(params.pattern, {
        cwd: searchDirAbsolute,
        absolute: true,
        onlyFiles: true,
        stats: true,
        dot: true,
        caseSensitiveMatch: params.case_sensitive ?? false,
        ignore: ['**/node_modules/**', '**/.git/**'],
        followSymbolicLinks: false,
        suppressErrors: true,
      });

      // Apply git-aware filtering if enabled and in git repository
      let filteredEntries = entries;
      let gitIgnoredCount = 0;

      if (respectGitIgnore && fileDiscovery.isGitRepository()) {
        const allPaths = entries.map((entry) => entry.path);
        const relativePaths = allPaths.map((p) =>
          path.relative(this.rootDirectory, p),
        );
        const filteredRelativePaths = fileDiscovery.filterFiles(relativePaths, {
          respectGitIgnore,
        });
        const filteredAbsolutePaths = new Set(
          filteredRelativePaths.map((p) => path.resolve(this.rootDirectory, p)),
        );

        filteredEntries = entries.filter((entry) =>
          filteredAbsolutePaths.has(entry.path),
        );
        gitIgnoredCount = entries.length - filteredEntries.length;
      }

      if (!filteredEntries || filteredEntries.length === 0) {
        let message = `No files found matching pattern "${params.pattern}" within ${searchDirAbsolute}.`;
        if (gitIgnoredCount > 0) {
          message += ` (${gitIgnoredCount} files were git-ignored)`;
        }
        return {
          llmContent: message,
          returnDisplay: `No files found`,
        };
      }

      // Set filtering such that we first show the most recent files
      const oneDayInMs = 24 * 60 * 60 * 1000;
      const nowTimestamp = new Date().getTime();

      // Sort the filtered entries using the new helper function
      const sortedEntries = sortFileEntries(
        filteredEntries as GlobFileEntry[], // Cast because fast-glob's Entry type is generic
        nowTimestamp,
        oneDayInMs,
      );

      const sortedAbsolutePaths = sortedEntries.map((entry) => entry.path);
      const fileListDescription = sortedAbsolutePaths.join('\n');
      const fileCount = sortedAbsolutePaths.length;

      let resultMessage = `Found ${fileCount} file(s) matching "${params.pattern}" within ${searchDirAbsolute}`;
      if (gitIgnoredCount > 0) {
        resultMessage += ` (${gitIgnoredCount} additional files were git-ignored)`;
      }
      resultMessage += `, sorted by modification time (newest first):\n${fileListDescription}`;

      return {
        llmContent: resultMessage,
        returnDisplay: `Found ${fileCount} matching file(s)`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`GlobLogic execute Error: ${errorMessage}`, error);
      return {
        llmContent: `Error during glob search operation: ${errorMessage}`,
        returnDisplay: `Error: An unexpected error occurred.`,
      };
    }
  }
}
