/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { BaseTool, ToolResult } from './tools.js';
import { shortenPath, makeRelative } from '../utils/paths.js';
import { Config } from '../config/config.js';

export enum SearchType {
  FILE = 'f',
  DIRECTORY = 'd',
}

export enum TimeUnit {
  DAY = 'd',
  WEEK = 'w',
  MONTH = 'm',
  YEAR = 'y',
}

export interface ChangedWithin {
  value: number;
  unit: TimeUnit;
}

declare const require: NodeJS.Require;

export interface PerformFileSearchOptions {
  pattern: string;
  rootDirectory: string;
  searchPath?: string;
  respect_git_ignore?: boolean;
  case_sensitive?: boolean;
  changed_within?: ChangedWithin;
  max_results?: number;
  search_type?: SearchType;
  abortSignal?: AbortSignal;
}

export async function performFileSearch(
  options: PerformFileSearchOptions,
): Promise<string[]> {
  const {
    pattern,
    rootDirectory,
    searchPath = '.',
    respect_git_ignore = true,
    case_sensitive = false,
    changed_within,
    max_results,
    search_type = SearchType.FILE,
    abortSignal,
  } = options;
  const searchDirAbsolute = path.resolve(rootDirectory, searchPath);

  const args = ['--type', search_type, '--absolute-path'];

  if (changed_within) {
    args.push('--changed-within', `${changed_within.value}${changed_within.unit}`);
  }

  if (max_results) {
    args.push('--max-results', max_results.toString());
  }

  if (pattern.includes(path.sep)) {
    args.push('--full-path');
  }

  if (!respect_git_ignore) {
    args.push('--no-ignore');
  }

  if (case_sensitive) {
    args.push('--case-sensitive');
  } else {
    args.push('--ignore-case');
  }

  args.push(pattern);

  const fdPackagePath = require.resolve('fd-find/package.json');
  const fdPath = path.resolve(path.dirname(fdPackagePath), '..', '.bin', 'fd');
  console.log('fd path:', fdPath);
  const child = spawn(fdPath, args, {
    cwd: searchDirAbsolute,
    signal: abortSignal,
  });

  let stdout = '';
  for await (const chunk of child.stdout) {
    stdout += chunk;
  }

  if (!stdout.trim()) {
    return [];
  }

  const entries = stdout.trim().split('\n');
  return entries;
}

/**
 * Parameters for the FileSearchTool
 */
export interface FileSearchToolParams {
  /**
   * The fileSearch pattern to match files against
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

  /**
   * Search for files based on modification time.
   * Format: <number><unit> (e.g., 2d, 1w, 3m)
   * Units: d (days), w (weeks), m (months), y (years)
   */
  changed_within?: string;

  /**
   * The maximum number of results to return.
   */
  max_results?: number;
}

/**
 * Implementation of the FileSearch tool logic
 */
export class FileSearchTool extends BaseTool<FileSearchToolParams, ToolResult> {
  static readonly Name = 'fileSearch';
  /**
   * Creates a new instance of the FileSearchLogic
   * @param rootDirectory Root directory to ground this tool in.
   */
  constructor(
    private rootDirectory: string,
    private config: Config,
  ) {
    super(
      FileSearchTool.Name,
      'FindFiles',
      'Efficiently finds files matching a regular expression, returning absolute paths. Ideal for quickly locating files based on their name or path structure, especially in large codebases.',
      {
        properties: {
          pattern: {
            description:
              "The regular expression to match against (e.g., '\\.py', 'docs\\/.*\\.md'",
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
  validateToolParams(params: FileSearchToolParams): string | null {
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

    if (
      params.changed_within &&
      !/^\d+[dwmy]$/.test(params.changed_within)
    ) {
      return "Invalid format for 'changed_within'. Expected format: <number><unit> (e.g., 2d, 1w, 3m).";
    }

    return null;
  }

  /**
   * Gets a description of the fileSearch operation.
   */
  getDescription(params: FileSearchToolParams): string {
    let description = `'${params.pattern}'`;
    if (params.path) {
      const searchDir = path.resolve(this.rootDirectory, params.path || '.');
      const relativePath = makeRelative(searchDir, this.rootDirectory);
      description += ` within ${shortenPath(relativePath)}`;
    }
    return description;
  }

  /**
   * Executes the fileSearch search with the given parameters
   */
  async execute(
    params: FileSearchToolParams,
    signal: AbortSignal,
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

      let changedWithin: ChangedWithin | undefined;
      if (params.changed_within) {
        const value = parseInt(params.changed_within.slice(0, -1));
        const unit = params.changed_within.slice(-1) as TimeUnit;
        changedWithin = { value, unit };
      }

      const entries = await performFileSearch({
        pattern: params.pattern,
        rootDirectory: this.rootDirectory,
        searchPath: params.path,
        respect_git_ignore: params.respect_git_ignore,
        case_sensitive: params.case_sensitive,
        changed_within: changedWithin,
        max_results: params.max_results,
        search_type: SearchType.FILE,
        abortSignal: signal,
      });

      if (!entries || entries.length === 0) {
        const message = `No files found matching pattern "${params.pattern}" within ${searchDirAbsolute}.`;
        return {
          llmContent: message,
          returnDisplay: `No files found`,
        };
      }

      const fileListDescription = entries.join('\n');
      const fileCount = entries.length;

      let resultMessage = `Found ${fileCount} file(s) matching "${params.pattern}" within ${searchDirAbsolute}`;
      resultMessage += `:\n${fileListDescription}`;

      return {
        llmContent: resultMessage,
        returnDisplay: `Found ${fileCount} matching file(s)`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`FileSearchLogic execute Error: ${errorMessage}`, error);
      return {
        llmContent: `Error during fileSearch search operation: ${errorMessage}`,
        returnDisplay: `Error: An unexpected error occurred.`,
      };
    }
  }
}
