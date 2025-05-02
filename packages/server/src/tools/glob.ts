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
  constructor(private rootDirectory: string) {
    super(
      GlobTool.Name,
      'FindFiles',
      'Efficiently finds files matching specific glob patterns (e.g., `src/**/*.ts`, `**/*.md`), returning absolute paths sorted by modification time (newest first). Ideal for quickly locating files based on their name or path structure, especially in large codebases.',
      {
        properties: {
          pattern: {
            description:
              "The glob pattern to match against (e.g., '*.py', 'src/**/*.js', 'docs/*.md').",
            type: 'string',
          },
          path: {
            description:
              'Optional: The absolute path to the directory to search within. If omitted, searches the root directory.',
            type: 'string',
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
      return "Parameters failed schema validation. Ensure 'pattern' is a string and 'path' (if provided) is a string.";
    }

    const searchDirAbsolute = path.resolve(
      this.rootDirectory,
      params.path || '.',
    );

    if (!this.isWithinRoot(searchDirAbsolute)) {
      return `Search path ("${searchDirAbsolute}") resolves outside the tool's root directory ("${this.rootDirectory}").`;
    }

    try {
      if (!fs.existsSync(searchDirAbsolute)) {
        return `Search path does not exist: ${shortenPath(makeRelative(searchDirAbsolute, this.rootDirectory))} (absolute: ${searchDirAbsolute})`;
      }
      if (!fs.statSync(searchDirAbsolute).isDirectory()) {
        return `Search path is not a directory: ${shortenPath(makeRelative(searchDirAbsolute, this.rootDirectory))} (absolute: ${searchDirAbsolute})`;
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
  async execute(params: GlobToolParams): Promise<ToolResult> {
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

      const entries = await fg(params.pattern, {
        cwd: searchDirAbsolute,
        absolute: true,
        onlyFiles: true,
        stats: true,
        dot: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
        followSymbolicLinks: false,
        suppressErrors: true,
      });

      if (!entries || entries.length === 0) {
        const displayPath = makeRelative(searchDirAbsolute, this.rootDirectory);
        return {
          llmContent: `No files found matching pattern "${params.pattern}" within ${displayPath || '.'}.`,
          returnDisplay: `No files found`,
        };
      }

      entries.sort((a, b) => {
        const mtimeA = a.stats?.mtime?.getTime() ?? 0;
        const mtimeB = b.stats?.mtime?.getTime() ?? 0;
        return mtimeB - mtimeA;
      });

      const sortedAbsolutePaths = entries.map((entry) => entry.path);
      const sortedRelativePaths = sortedAbsolutePaths.map((absPath) =>
        makeRelative(absPath, this.rootDirectory),
      );

      const fileListDescription = sortedRelativePaths.join('\n');
      const fileCount = sortedRelativePaths.length;
      const relativeSearchDir = makeRelative(
        searchDirAbsolute,
        this.rootDirectory,
      );
      const displayPath = shortenPath(
        relativeSearchDir === '.' ? 'root directory' : relativeSearchDir,
      );

      return {
        llmContent: `Found ${fileCount} file(s) matching "${params.pattern}" within ${displayPath}, sorted by modification time (newest first):\n${fileListDescription}`,
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
