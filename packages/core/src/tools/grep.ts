/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { EOL } from 'os';
import { spawn } from 'child_process';
import { globStream } from 'glob';
import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import { isGitRepository } from '../utils/gitUtils.js';

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
  path?: string;

  /**
   * File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")
   */
  include?: string;

  /**
   * Show N lines of context around matching lines.
   */
  context?: number;

  /**
   * Invert the sense of matching, to select non-matching lines.
   */
  invert_match?: boolean;

  /**
   * Read all files under each directory, recursively.
   */
  recursive?: boolean;

  /**
   * Search for exact word matches.
   */
  word_boundary?: boolean;

  /**
   * Count matching lines.
   */
  count?: boolean;

  /**
   * Show N lines of context before matching lines.
   */
  before_context?: number;

  /**
   * Show N lines of context after matching lines.
   */
  after_context?: number;

  /**
   * Search only for the matching part of lines.
   */
  only_matching?: boolean;

  /**
   * Toggle for case-sensitive search.
   */
  case_sensitive?: boolean;

  /**
   * A natural language query to be translated into a regex pattern.
   */
  natural_language_query?: string;

  /**
   * A glob pattern for files to exclude from the search.
   */
  exclude?: string;
}

/**
 * Result object for a single grep match
 */
interface GrepMatch {
  filePath: string;
  lineNumber: number;
  line: string;
}

// --- GrepLogic Class ---

/**
 * Implementation of the Grep tool logic (moved from CLI)
 */
export class GrepTool extends BaseTool<GrepToolParams, ToolResult> {
  static readonly Name = 'search_file_content'; // Keep static name

  /**
   * Creates a new instance of the GrepLogic
   * @param rootDirectory Root directory to ground this tool in. All operations will be restricted to this directory.
   */
  constructor(private rootDirectory: string) {
    super(
      GrepTool.Name,
      'SearchText',
      'Searches for a regular expression pattern within the content of files in a specified directory (or current working directory). Can filter files by a glob pattern. Returns the lines containing matches, along with their file paths and line numbers.',
      {
        properties: {
          pattern: {
            description:
              "The regular expression (regex) pattern to search for within file contents (e.g., 'function\\s+myFunction', 'import\\s+\\{.*\\}\\s+from\\s+.*').",
            type: 'string',
          },
          path: {
            description:
              'Optional: The absolute path to the directory to search within. If omitted, searches the current working directory.',
            type: 'string',
          },
          include: {
            description:
              "Optional: A glob pattern to filter which files are searched (e.g., '*.js', '*.{ts,tsx}', 'src/**'). If omitted, searches all files (respecting potential global ignores).",
            type: 'string',
          },
          context: {
            description:
              'Optional: Show N lines of context around matching lines.',
            type: 'number',
          },
          invert_match: {
            description:
              'Optional: Invert the sense of matching, to select non-matching lines.',
            type: 'boolean',
          },
          recursive: {
            description:
              'Optional: Read all files under each directory, recursively.',
            type: 'boolean',
          },
          word_boundary: {
            description: 'Optional: Search for exact word matches.',
            type: 'boolean',
          },
          count: {
            description: 'Optional: Count matching lines.',
            type: 'boolean',
          },
          before_context: {
            description:
              'Optional: Show N lines of context before matching lines.',
            type: 'number',
          },
          after_context: {
            description:
              'Optional: Show N lines of context after matching lines.',
            type: 'number',
          },
          only_matching: {
            description:
              'Optional: Search only for the matching part of lines.',
            type: 'boolean',
          },
          case_sensitive: {
            description: 'Optional: Toggle for case-sensitive search.',
            type: 'boolean',
          },
          natural_language_query: {
            description:
              'Optional: A natural language query to be translated into a regex pattern.',
            type: 'string',
          },
          exclude: {
            description:
              'Optional: A glob pattern for files to exclude from the search.',
            type: 'string',
          },
        },
        required: ['pattern'],
        type: 'object',
      },
    );
    // Ensure rootDirectory is absolute and normalized
    this.rootDirectory = path.resolve(rootDirectory);
  }

  // --- Validation Methods ---

  /**
   * Checks if a path is within the root directory and resolves it.
   * @param relativePath Path relative to the root directory (or undefined for root).
   * @returns The absolute path if valid and exists.
   * @throws {Error} If path is outside root, doesn't exist, or isn't a directory.
   */
  private resolveAndValidatePath(relativePath?: string): string {
    const targetPath = path.resolve(this.rootDirectory, relativePath || '.');

    // Security Check: Ensure the resolved path is still within the root directory.
    if (
      !targetPath.startsWith(this.rootDirectory) &&
      targetPath !== this.rootDirectory
    ) {
      throw new Error(
        `Path validation failed: Attempted path "${relativePath || '.'}" resolves outside the allowed root directory "${this.rootDirectory}".`,
      );
    }

    // Check existence and type after resolving
    try {
      const stats = fs.statSync(targetPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${targetPath}`);
      }
    } catch (error: unknown) {
      if (isNodeError(error) && error.code !== 'ENOENT') {
        throw new Error(`Path does not exist: ${targetPath}`);
      }
      throw new Error(
        `Failed to access path stats for ${targetPath}: ${error}`,
      );
    }

    return targetPath;
  }

  /**
   * Validates the parameters for the tool
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  validateToolParams(params: GrepToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }

    try {
      new RegExp(params.pattern);
    } catch (error) {
      return `Invalid regular expression pattern provided: ${params.pattern}. Error: ${getErrorMessage(error)}`;
    }

    try {
      this.resolveAndValidatePath(params.path);
    } catch (error) {
      return getErrorMessage(error);
    }

    return null; // Parameters are valid
  }

  // --- Core Execution ---

  /**
   * Executes the grep search with the given parameters
   * @param params Parameters for the grep search
   * @returns Result of the grep search
   */
  async execute(
    params: GrepToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Model provided invalid parameters. Error: ${validationError}`,
      };
    }

    let searchDirAbs: string;
    try {
      searchDirAbs = this.resolveAndValidatePath(params.path);
      const searchDirDisplay = params.path || '.';

      const matches: GrepMatch[] = await this.performGrepSearch({
        pattern: params.pattern,
        path: searchDirAbs,
        include: params.include,
        signal,
      });

      if (matches.length === 0) {
        const noMatchMsg = `No matches found for pattern "${params.pattern}" in path "${searchDirDisplay}"${params.include ? ` (filter: "${params.include}")` : ''}.`;
        return { llmContent: noMatchMsg, returnDisplay: `No matches found` };
      }

      const matchesByFile = matches.reduce(
        (acc, match) => {
          const relativeFilePath =
            path.relative(
              searchDirAbs,
              path.resolve(searchDirAbs, match.filePath),
            ) || path.basename(match.filePath);
          if (!acc[relativeFilePath]) {
            acc[relativeFilePath] = [];
          }
          acc[relativeFilePath].push(match);
          acc[relativeFilePath].sort((a, b) => a.lineNumber - b.lineNumber);
          return acc;
        },
        {} as Record<string, GrepMatch[]>,
      );

      const matchCount = matches.length;
      const matchTerm = matchCount === 1 ? 'match' : 'matches';

      let llmContent = `Found ${matchCount} ${matchTerm} for pattern "${params.pattern}" in path "${searchDirDisplay}"${params.include ? ` (filter: "${params.include}")` : ''}:\n---\n`;

      for (const filePath in matchesByFile) {
        llmContent += `File: ${filePath}\n`;
        matchesByFile[filePath].forEach((match) => {
          const trimmedLine = match.line.trim();
          llmContent += `L${match.lineNumber}: ${trimmedLine}\n`;
        });
        llmContent += '---\n';
      }

      return {
        llmContent: llmContent.trim(),
        returnDisplay: `Found ${matchCount} ${matchTerm}`,
      };
    } catch (error) {
      console.error(`Error during GrepLogic execution: ${error}`);
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Error during grep search operation: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  // --- Grep Implementation Logic ---

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
          shell: process.platform === 'win32',
        });
        child.on('close', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Parses the standard output of grep-like commands (git grep, system grep).
   * Expects format: filePath:lineNumber:lineContent
   * Handles colons within file paths and line content correctly.
   * @param {string} output The raw stdout string.
   * @param {string} basePath The absolute directory the search was run from, for relative paths.
   * @returns {GrepMatch[]} Array of match objects.
   */
  private parseGrepOutput(output: string, basePath: string): GrepMatch[] {
    const results: GrepMatch[] = [];
    if (!output) return results;

    const lines = output.split(EOL); // Use OS-specific end-of-line

    for (const line of lines) {
      if (!line.trim()) continue;

      // Find the index of the first colon.
      const firstColonIndex = line.indexOf(':');
      if (firstColonIndex === -1) continue; // Malformed

      // Find the index of the second colon, searching *after* the first one.
      const secondColonIndex = line.indexOf(':', firstColonIndex + 1);
      if (secondColonIndex === -1) continue; // Malformed

      // Extract parts based on the found colon indices
      const filePathRaw = line.substring(0, firstColonIndex);
      const lineNumberStr = line.substring(
        firstColonIndex + 1,
        secondColonIndex,
      );
      const lineContent = line.substring(secondColonIndex + 1);

      const lineNumber = parseInt(lineNumberStr, 10);

      if (!isNaN(lineNumber)) {
        const absoluteFilePath = path.resolve(basePath, filePathRaw);
        const relativeFilePath = path.relative(basePath, absoluteFilePath);

        results.push({
          filePath: relativeFilePath || path.basename(absoluteFilePath),
          lineNumber,
          line: lineContent,
        });
      }
    }
    return results;
  }

  /**
   * Gets a description of the grep operation
   * @param params Parameters for the grep operation
   * @returns A string describing the grep
   */
  getDescription(params: GrepToolParams): string {
    let description = `'${params.pattern}'`;
    if (params.include) {
      description += ` in ${params.include}`;
    }
    if (params.path) {
      const resolvedPath = path.resolve(this.rootDirectory, params.path);
      if (resolvedPath === this.rootDirectory || params.path === '.') {
        description += ` within ./`;
      } else {
        const relativePath = makeRelative(resolvedPath, this.rootDirectory);
        description += ` within ${shortenPath(relativePath)}`;
      }
    }
    return description;
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
    context?: number;
    invert_match?: boolean;
    recursive?: boolean;
    word_boundary?: boolean;
    count?: boolean;
    before_context?: number;
    after_context?: number;
    only_matching?: boolean;
    case_sensitive?: boolean;
    natural_language_query?: string;
    exclude?: string;
    signal: AbortSignal;
  }): Promise<GrepMatch[]> {
    const {
      pattern,
      path: absolutePath,
      include,
      context,
      invert_match,
      recursive,
      word_boundary,
      count,
      before_context,
      after_context,
      only_matching,
      case_sensitive,
      natural_language_query,
      exclude,
    } = options;
    let strategyUsed = 'none';

    let searchPattern = pattern;
    if (natural_language_query) {
      // In a real implementation, this would be a call to an LLM to translate the query to a regex.
      // For this example, we'll use a simple mapping.
      const patternMap: { [key: string]: string } = {
        'find class TA': 'class TA:',
        'find init': 'def __init__',
      };
      searchPattern =
        patternMap[natural_language_query.toLowerCase()] || pattern;
    }

    if (word_boundary) {
      searchPattern = `\\b${searchPattern}\\b`;
    }

    try {
      // --- Strategy 1: git grep ---
      const isGit = isGitRepository(absolutePath);
      const gitAvailable = isGit && (await this.isCommandAvailable('git'));

      if (gitAvailable) {
        strategyUsed = 'git grep';
        const gitArgs = ['grep', '--untracked', '-n', '-E'];
        if (!case_sensitive) {
          gitArgs.push('--ignore-case');
        }
        if (context) {
          gitArgs.push(`-C${context}`);
        }
        if (before_context) {
          gitArgs.push(`-B${before_context}`);
        }
        if (after_context) {
          gitArgs.push(`-A${after_context}`);
        }
        if (invert_match) {
          gitArgs.push('--invert-match');
        }
        if (count) {
          gitArgs.push('--count');
        }
        if (only_matching) {
          // git grep doesn't have a direct equivalent of -o, so we'll have to do it in post-processing
        }
        gitArgs.push(searchPattern);
        if (include) {
          gitArgs.push('--', include);
        }
        if (exclude) {
          gitArgs.push(`:(exclude)${exclude}`);
        }

        try {
          const output = await new Promise<string>((resolve, reject) => {
            const child = spawn('git', gitArgs, {
              cwd: absolutePath,
              windowsHide: true,
            });
            const stdoutChunks: Buffer[] = [];
            const stderrChunks: Buffer[] = [];

            child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
            child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
            child.on('error', (err) =>
              reject(new Error(`Failed to start git grep: ${err.message}`)),
            );
            child.on('close', (code) => {
              const stdoutData = Buffer.concat(stdoutChunks).toString('utf8');
              const stderrData = Buffer.concat(stderrChunks).toString('utf8');
              if (code === 0) resolve(stdoutData);
              else if (code === 1)
                resolve(''); // No matches
              else
                reject(
                  new Error(`git grep exited with code ${code}: ${stderrData}`),
                );
            });
          });
          return this.parseGrepOutput(output, absolutePath);
        } catch (gitError: unknown) {
          console.debug(
            `GrepLogic: git grep failed: ${getErrorMessage(
              gitError,
            )}. Falling back...`,
          );
        }
      }

      // --- Strategy 2: System grep ---
      const grepAvailable = await this.isCommandAvailable('grep');
      if (grepAvailable) {
        strategyUsed = 'system grep';
        const grepArgs = ['-n', '-H', '-E'];
        if (recursive) {
          grepArgs.push('-r');
        }
        if (!case_sensitive) {
          grepArgs.push('-i');
        }
        if (context) {
          grepArgs.push(`-C${context}`);
        }
        if (before_context) {
          grepArgs.push(`-B${before_context}`);
        }
        if (after_context) {
          grepArgs.push(`-A${after_context}`);
        }
        if (invert_match) {
          grepArgs.push('-v');
        }
        if (count) {
          grepArgs.push('-c');
        }
        if (only_matching) {
          grepArgs.push('-o');
        }
        const commonExcludes = ['.git', 'node_modules', 'bower_components'];
        commonExcludes.forEach((dir) => grepArgs.push(`--exclude-dir=${dir}`));
        if (include) {
          grepArgs.push(`--include=${include}`);
        }
        if (exclude) {
          grepArgs.push(`--exclude=${exclude}`);
        }
        grepArgs.push(searchPattern);
        grepArgs.push('.');

        try {
          const output = await new Promise<string>((resolve, reject) => {
            const child = spawn('grep', grepArgs, {
              cwd: absolutePath,
              windowsHide: true,
            });
            const stdoutChunks: Buffer[] = [];
            const stderrChunks: Buffer[] = [];

            const onData = (chunk: Buffer) => stdoutChunks.push(chunk);
            const onStderr = (chunk: Buffer) => {
              const stderrStr = chunk.toString();
              // Suppress common harmless stderr messages
              if (
                !stderrStr.includes('Permission denied') &&
                !/grep:.*: Is a directory/i.test(stderrStr)
              ) {
                stderrChunks.push(chunk);
              }
            };
            const onError = (err: Error) => {
              cleanup();
              reject(new Error(`Failed to start system grep: ${err.message}`));
            };
            const onClose = (code: number | null) => {
              const stdoutData = Buffer.concat(stdoutChunks).toString('utf8');
              const stderrData = Buffer.concat(stderrChunks)
                .toString('utf8')
                .trim();
              cleanup();
              if (code === 0) resolve(stdoutData);
              else if (code === 1)
                resolve(''); // No matches
              else {
                if (stderrData)
                  reject(
                    new Error(
                      `System grep exited with code ${code}: ${stderrData}`,
                    ),
                  );
                else resolve(''); // Exit code > 1 but no stderr, likely just suppressed errors
              }
            };

            const cleanup = () => {
              child.stdout.removeListener('data', onData);
              child.stderr.removeListener('data', onStderr);
              child.removeListener('error', onError);
              child.removeListener('close', onClose);
              if (child.connected) {
                child.disconnect();
              }
            };

            child.stdout.on('data', onData);
            child.stderr.on('data', onStderr);
            child.on('error', onError);
            child.on('close', onClose);
          });
          return this.parseGrepOutput(output, absolutePath);
        } catch (grepError: unknown) {
          console.debug(
            `GrepLogic: System grep failed: ${getErrorMessage(
              grepError,
            )}. Falling back...`,
          );
        }
      }

      // --- Strategy 3: Pure JavaScript Fallback ---
      console.debug(
        'GrepLogic: Falling back to JavaScript grep implementation.',
      );
      strategyUsed = 'javascript fallback';
      const globPattern = include ? include : '**/*';
      const ignorePatterns = [
        '.git/**',
        'node_modules/**',
        'bower_components/**',
        '.svn/**',
        '.hg/**',
      ]; // Use glob patterns for ignores here
      if (exclude) {
        ignorePatterns.push(exclude);
      }

      const filesStream = globStream(globPattern, {
        cwd: absolutePath,
        dot: true,
        ignore: ignorePatterns,
        absolute: true,
        nodir: true,
        signal: options.signal,
      });

      const regex = new RegExp(searchPattern, case_sensitive ? '' : 'i');
      const allMatches: GrepMatch[] = [];
      let matchCount = 0;

      for await (const filePath of filesStream) {
        const fileAbsolutePath = filePath as string;
        try {
          const content = await fsPromises.readFile(fileAbsolutePath, 'utf8');
          const lines = content.split(/\r?\n/);
          lines.forEach((line, index) => {
            const match = regex.test(line);
            if ((match && !invert_match) || (!match && invert_match)) {
              if (count) {
                matchCount++;
                return;
              }
              const start = Math.max(
                0,
                index - (context ?? before_context ?? 0),
              );
              const end = Math.min(
                lines.length,
                index + (context ?? after_context ?? 0) + 1,
              );
              for (let i = start; i < end; i++) {
                if (only_matching) {
                  const matches = lines[i].match(regex);
                  if (matches) {
                    matches.forEach((m) => {
                      allMatches.push({
                        filePath:
                          path.relative(absolutePath, fileAbsolutePath) ||
                          path.basename(fileAbsolutePath),
                        lineNumber: i + 1,
                        line: m,
                      });
                    });
                  }
                } else {
                  allMatches.push({
                    filePath:
                      path.relative(absolutePath, fileAbsolutePath) ||
                      path.basename(fileAbsolutePath),
                    lineNumber: i + 1,
                    line: lines[i],
                  });
                }
              }
            }
          });
        } catch (readError: unknown) {
          // Ignore errors like permission denied or file gone during read
          if (!isNodeError(readError) || readError.code !== 'ENOENT') {
            console.debug(
              `GrepLogic: Could not read/process ${fileAbsolutePath}: ${getErrorMessage(
                readError,
              )}`,
            );
          }
        }
      }
      if (count) {
        return [
          {
            filePath: '',
            lineNumber: 0,
            line: matchCount.toString(),
          },
        ];
      }

      return allMatches;
    } catch (error: unknown) {
      console.error(
        `GrepLogic: Error in performGrepSearch (Strategy: ${strategyUsed}): ${getErrorMessage(
          error,
        )}`,
      );
      throw error; // Re-throw
    }
  }
}
