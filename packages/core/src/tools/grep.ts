/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { globStream } from 'glob';
import type { ToolInvocation, ToolResult } from './tools.js';
import { execStreaming } from '../utils/shell-utils.js';
import {
  DEFAULT_TOTAL_MAX_MATCHES,
  DEFAULT_SEARCH_TIMEOUT_MS,
} from './constants.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import { isGitRepository } from '../utils/gitUtils.js';
import type { Config } from '../config/config.js';
import type { FileExclusions } from '../utils/ignorePatterns.js';
import { ToolErrorType } from './tool-error.js';
import { GREP_TOOL_NAME } from './tool-names.js';
import { debugLogger } from '../utils/debugLogger.js';
import { GREP_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { type GrepMatch, formatGrepResults } from './grep-utils.js';

// --- Interfaces ---

/**
 * Parameters for the GrepTool
 */
export interface GrepToolParams {
  /**
   * The regular expression pattern to search for in file contents
   */
  pattern: string;

  /**
   * The directory to search in (optional, defaults to current directory relative to root)
   */
  dir_path?: string;

  /**
   * File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")
   */
  include?: string;

  /**
   * Optional: A regular expression pattern to exclude from the search results.
   */
  exclude_pattern?: string;

  /**
   * Optional: If true, only the file paths of the matches will be returned.
   */
  names_only?: boolean;

  /**
   * Optional: Maximum number of matches to return per file. Use this to prevent being overwhelmed by repetitive matches in large files.
   */
  max_matches_per_file?: number;

  /**
   * Optional: Maximum number of total matches to return. Use this to limit the overall size of the response. Defaults to 100 if omitted.
   */
  total_max_matches?: number;
}

class GrepToolInvocation extends BaseToolInvocation<
  GrepToolParams,
  ToolResult
> {
  private readonly fileExclusions: FileExclusions;

  constructor(
    private readonly config: Config,
    params: GrepToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
    this.fileExclusions = config.getFileExclusions();
  }

  /**
   * Parses a single line of grep-like output (git grep, system grep).
   * Expects format: filePath:lineNumber:lineContent
   * @param {string} line The line to parse.
   * @param {string} basePath The absolute directory for path resolution.
   * @returns {GrepMatch | null} Parsed match or null if malformed.
   */
  private parseGrepLine(line: string, basePath: string): GrepMatch | null {
    if (!line.trim()) return null;

    // Use regex to locate the first occurrence of :<digits>:
    // This allows filenames to contain colons, as long as they don't look like :<digits>:
    // Note: This regex assumes filenames do not contain colons, or at least not followed by digits.
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (!match) return null;

    const [, filePathRaw, lineNumberStr, lineContent] = match;
    const lineNumber = parseInt(lineNumberStr, 10);

    if (!isNaN(lineNumber)) {
      const absoluteFilePath = path.resolve(basePath, filePathRaw);
      const relativeCheck = path.relative(basePath, absoluteFilePath);
      if (
        relativeCheck === '..' ||
        relativeCheck.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeCheck)
      ) {
        return null;
      }

      const relativeFilePath = path.relative(basePath, absoluteFilePath);

      return {
        filePath: relativeFilePath || path.basename(absoluteFilePath),
        absolutePath: absoluteFilePath,
        lineNumber,
        line: lineContent,
      };
    }
    return null;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      const workspaceContext = this.config.getWorkspaceContext();
      const pathParam = this.params.dir_path;

      let searchDirAbs: string | null = null;
      if (pathParam) {
        searchDirAbs = path.resolve(this.config.getTargetDir(), pathParam);
        const validationError = this.config.validatePathAccess(
          searchDirAbs,
          'read',
        );
        if (validationError) {
          return {
            llmContent: validationError,
            returnDisplay: 'Error: Path not in workspace.',
            error: {
              message: validationError,
              type: ToolErrorType.PATH_NOT_IN_WORKSPACE,
            },
          };
        }

        try {
          const stats = await fsPromises.stat(searchDirAbs);
          if (!stats.isDirectory()) {
            return {
              llmContent: `Path is not a directory: ${searchDirAbs}`,
              returnDisplay: 'Error: Path is not a directory.',
              error: {
                message: `Path is not a directory: ${searchDirAbs}`,
                type: ToolErrorType.PATH_IS_NOT_A_DIRECTORY,
              },
            };
          }
        } catch (error: unknown) {
          if (isNodeError(error) && error.code === 'ENOENT') {
            return {
              llmContent: `Path does not exist: ${searchDirAbs}`,
              returnDisplay: 'Error: Path does not exist.',
              error: {
                message: `Path does not exist: ${searchDirAbs}`,
                type: ToolErrorType.FILE_NOT_FOUND,
              },
            };
          }
          const errorMessage = getErrorMessage(error);
          return {
            llmContent: `Failed to access path stats for ${searchDirAbs}: ${errorMessage}`,
            returnDisplay: 'Error: Failed to access path.',
            error: {
              message: `Failed to access path stats for ${searchDirAbs}: ${errorMessage}`,
              type: ToolErrorType.GREP_EXECUTION_ERROR,
            },
          };
        }
      }

      const searchDirDisplay = pathParam || '.';

      // Determine which directories to search
      let searchDirectories: readonly string[];
      if (searchDirAbs === null) {
        // No path specified - search all workspace directories
        searchDirectories = workspaceContext.getDirectories();
      } else {
        // Specific path provided - search only that directory
        searchDirectories = [searchDirAbs];
      }

      // Collect matches from all search directories
      let allMatches: GrepMatch[] = [];
      const totalMaxMatches =
        this.params.total_max_matches ?? DEFAULT_TOTAL_MAX_MATCHES;

      // Create a timeout controller to prevent indefinitely hanging searches
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => {
        timeoutController.abort();
      }, DEFAULT_SEARCH_TIMEOUT_MS);

      // Link the passed signal to our timeout controller
      const onAbort = () => timeoutController.abort();
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        for (const searchDir of searchDirectories) {
          const remainingLimit = totalMaxMatches - allMatches.length;
          if (remainingLimit <= 0) break;

          const matches = await this.performGrepSearch({
            pattern: this.params.pattern,
            path: searchDir,
            include: this.params.include,
            exclude_pattern: this.params.exclude_pattern,
            maxMatches: remainingLimit,
            max_matches_per_file: this.params.max_matches_per_file,
            signal: timeoutController.signal,
          });

          // Add directory prefix if searching multiple directories
          if (searchDirectories.length > 1) {
            const dirName = path.basename(searchDir);
            matches.forEach((match) => {
              match.filePath = path.join(dirName, match.filePath);
            });
          }

          allMatches = allMatches.concat(matches);
        }
      } finally {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onAbort);
      }

      let searchLocationDescription: string;
      if (searchDirAbs === null) {
        const numDirs = workspaceContext.getDirectories().length;
        searchLocationDescription =
          numDirs > 1
            ? `across ${numDirs} workspace directories`
            : `in the workspace directory`;
      } else {
        searchLocationDescription = `in path "${searchDirDisplay}"`;
      }

      return await formatGrepResults(
        allMatches,
        this.params,
        searchLocationDescription,
        totalMaxMatches,
      );
    } catch (error) {
      debugLogger.warn(`Error during GrepLogic execution: ${error}`);
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Error during grep search operation: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.GREP_EXECUTION_ERROR,
        },
      };
    }
  }

  /**
   * Checks if a command is available in the system's PATH.
   * @param {string} command The command name (e.g., 'git', 'grep').
   * @returns {Promise<boolean>} True if the command is available, false otherwise.
   */
  private isCommandAvailable(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkCommand = process.platform === 'win32' ? 'where' : 'command';
      const checkArgs =
        process.platform === 'win32' ? [command] : ['-v', command];
      try {
        const child = spawn(checkCommand, checkArgs, {
          stdio: 'ignore',
          shell: true,
        });
        child.on('close', (code) => resolve(code === 0));
        child.on('error', (err) => {
          debugLogger.debug(
            `[GrepTool] Failed to start process for '${command}':`,
            err.message,
          );
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Performs the actual search using the prioritized strategies.
   * @param options Search options including pattern, absolute path, and include glob.
   * @returns A promise resolving to an array of match objects.
   */
  private async performGrepSearch(options: {
    pattern: string;
    path: string; // Expects absolute path
    include?: string;
    exclude_pattern?: string;
    maxMatches: number;
    max_matches_per_file?: number;
    signal: AbortSignal;
  }): Promise<GrepMatch[]> {
    const {
      pattern,
      path: absolutePath,
      include,
      exclude_pattern,
      maxMatches,
      max_matches_per_file,
    } = options;
    let strategyUsed = 'none';

    try {
      let excludeRegex: RegExp | null = null;
      if (exclude_pattern) {
        excludeRegex = new RegExp(exclude_pattern, 'i');
      }

      // --- Strategy 1: git grep ---
      const isGit = isGitRepository(absolutePath);
      const gitAvailable = isGit && (await this.isCommandAvailable('git'));

      if (gitAvailable) {
        strategyUsed = 'git grep';
        const gitArgs = [
          'grep',
          '--untracked',
          '-n',
          '-E',
          '--ignore-case',
          pattern,
        ];
        if (max_matches_per_file) {
          gitArgs.push('--max-count', max_matches_per_file.toString());
        }
        if (include) {
          gitArgs.push('--', include);
        }

        try {
          const generator = execStreaming('git', gitArgs, {
            cwd: absolutePath,
            signal: options.signal,
            allowedExitCodes: [0, 1],
          });

          const results: GrepMatch[] = [];
          for await (const line of generator) {
            const match = this.parseGrepLine(line, absolutePath);
            if (match) {
              if (excludeRegex && excludeRegex.test(match.line)) {
                continue;
              }
              results.push(match);
              if (results.length >= maxMatches) {
                break;
              }
            }
          }
          return results;
        } catch (gitError: unknown) {
          debugLogger.debug(
            `GrepLogic: git grep failed: ${getErrorMessage(
              gitError,
            )}. Falling back...`,
          );
        }
      }

      // --- Strategy 2: System grep ---
      debugLogger.debug(
        'GrepLogic: System grep is being considered as fallback strategy.',
      );

      const grepAvailable = await this.isCommandAvailable('grep');
      if (grepAvailable) {
        strategyUsed = 'system grep';
        const grepArgs = ['-r', '-n', '-H', '-E', '-I'];
        // Extract directory names from exclusion patterns for grep --exclude-dir
        const globExcludes = this.fileExclusions.getGlobExcludes();
        const commonExcludes = globExcludes
          .map((pattern) => {
            let dir = pattern;
            if (dir.startsWith('**/')) {
              dir = dir.substring(3);
            }
            if (dir.endsWith('/**')) {
              dir = dir.slice(0, -3);
            } else if (dir.endsWith('/')) {
              dir = dir.slice(0, -1);
            }

            // Only consider patterns that are likely directories. This filters out file patterns.
            if (dir && !dir.includes('/') && !dir.includes('*')) {
              return dir;
            }
            return null;
          })
          .filter((dir): dir is string => !!dir);
        commonExcludes.forEach((dir) => grepArgs.push(`--exclude-dir=${dir}`));
        if (max_matches_per_file) {
          grepArgs.push('--max-count', max_matches_per_file.toString());
        }
        if (include) {
          grepArgs.push(`--include=${include}`);
        }
        grepArgs.push(pattern);
        grepArgs.push('.');

        const results: GrepMatch[] = [];
        try {
          const generator = execStreaming('grep', grepArgs, {
            cwd: absolutePath,
            signal: options.signal,
            allowedExitCodes: [0, 1],
          });

          for await (const line of generator) {
            const match = this.parseGrepLine(line, absolutePath);
            if (match) {
              if (excludeRegex && excludeRegex.test(match.line)) {
                continue;
              }
              results.push(match);
              if (results.length >= maxMatches) {
                break;
              }
            }
          }
          return results;
        } catch (grepError: unknown) {
          if (
            grepError instanceof Error &&
            /Permission denied|Is a directory/i.test(grepError.message)
          ) {
            return results;
          }
          debugLogger.debug(
            `GrepLogic: System grep failed: ${getErrorMessage(
              grepError,
            )}. Falling back...`,
          );
        }
      }

      // --- Strategy 3: Pure JavaScript Fallback ---
      debugLogger.debug(
        'GrepLogic: Falling back to JavaScript grep implementation.',
      );
      strategyUsed = 'javascript fallback';
      const globPattern = include ? include : '**/*';
      const ignorePatterns = this.fileExclusions.getGlobExcludes();

      const filesStream = globStream(globPattern, {
        cwd: absolutePath,
        dot: true,
        ignore: ignorePatterns,
        absolute: true,
        nodir: true,
        signal: options.signal,
      });

      const regex = new RegExp(pattern, 'i');
      const allMatches: GrepMatch[] = [];

      for await (const filePath of filesStream) {
        if (allMatches.length >= maxMatches) break;
        const fileAbsolutePath = filePath;
        // security check
        const relativePath = path.relative(absolutePath, fileAbsolutePath);
        if (
          relativePath === '..' ||
          relativePath.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relativePath)
        )
          continue;

        try {
          const content = await fsPromises.readFile(fileAbsolutePath, 'utf8');
          const lines = content.split(/\r?\n/);
          let matchesInFile = 0;
          for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            if (regex.test(line)) {
              if (excludeRegex && excludeRegex.test(line)) {
                continue;
              }
              allMatches.push({
                filePath:
                  path.relative(absolutePath, fileAbsolutePath) ||
                  path.basename(fileAbsolutePath),
                absolutePath: fileAbsolutePath,
                lineNumber: index + 1,
                line,
              });
              matchesInFile++;
              if (allMatches.length >= maxMatches) break;
              if (
                max_matches_per_file &&
                matchesInFile >= max_matches_per_file
              ) {
                break;
              }
            }
          }
        } catch (readError: unknown) {
          // Ignore errors like permission denied or file gone during read
          if (!isNodeError(readError) || readError.code !== 'ENOENT') {
            debugLogger.debug(
              `GrepLogic: Could not read/process ${fileAbsolutePath}: ${getErrorMessage(
                readError,
              )}`,
            );
          }
        }
      }

      return allMatches;
    } catch (error: unknown) {
      debugLogger.warn(
        `GrepLogic: Error in performGrepSearch (Strategy: ${strategyUsed}): ${getErrorMessage(
          error,
        )}`,
      );
      throw error; // Re-throw
    }
  }

  getDescription(): string {
    let description = `'${this.params.pattern}'`;
    if (this.params.include) {
      description += ` in ${this.params.include}`;
    }
    if (this.params.dir_path) {
      const resolvedPath = path.resolve(
        this.config.getTargetDir(),
        this.params.dir_path,
      );
      if (
        resolvedPath === this.config.getTargetDir() ||
        this.params.dir_path === '.'
      ) {
        description += ` within ./`;
      } else {
        const relativePath = makeRelative(
          resolvedPath,
          this.config.getTargetDir(),
        );
        description += ` within ${shortenPath(relativePath)}`;
      }
    } else {
      // When no path is specified, indicate searching all workspace directories
      const workspaceContext = this.config.getWorkspaceContext();
      const directories = workspaceContext.getDirectories();
      if (directories.length > 1) {
        description += ` across all workspace directories`;
      }
    }
    return description;
  }
}

/**
 * Implementation of the Grep tool logic (moved from CLI)
 */
export class GrepTool extends BaseDeclarativeTool<GrepToolParams, ToolResult> {
  static readonly Name = GREP_TOOL_NAME;
  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      GrepTool.Name,
      'SearchText',
      GREP_DEFINITION.base.description!,
      Kind.Search,
      GREP_DEFINITION.base.parametersJsonSchema,
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
    params: GrepToolParams,
  ): string | null {
    try {
      new RegExp(params.pattern);
    } catch (error) {
      return `Invalid regular expression pattern provided: ${params.pattern}. Error: ${getErrorMessage(error)}`;
    }

    if (params.exclude_pattern) {
      try {
        new RegExp(params.exclude_pattern);
      } catch (error) {
        return `Invalid exclude regular expression pattern provided: ${params.exclude_pattern}. Error: ${getErrorMessage(error)}`;
      }
    }

    if (
      params.max_matches_per_file !== undefined &&
      params.max_matches_per_file < 1
    ) {
      return 'max_matches_per_file must be at least 1.';
    }

    if (
      params.total_max_matches !== undefined &&
      params.total_max_matches < 1
    ) {
      return 'total_max_matches must be at least 1.';
    }

    // Only validate dir_path if one is provided
    if (params.dir_path) {
      const resolvedPath = path.resolve(
        this.config.getTargetDir(),
        params.dir_path,
      );
      const validationError = this.config.validatePathAccess(
        resolvedPath,
        'read',
      );
      if (validationError) {
        return validationError;
      }

      // We still want to check if it's a directory
      try {
        const stats = fs.statSync(resolvedPath);
        if (!stats.isDirectory()) {
          return `Path is not a directory: ${resolvedPath}`;
        }
      } catch (error: unknown) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          return `Path does not exist: ${resolvedPath}`;
        }
        return `Failed to access path stats for ${resolvedPath}: ${getErrorMessage(error)}`;
      }
    }

    return null; // Parameters are valid
  }

  protected createInvocation(
    params: GrepToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<GrepToolParams, ToolResult> {
    return new GrepToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(GREP_DEFINITION, modelId);
  }
}
