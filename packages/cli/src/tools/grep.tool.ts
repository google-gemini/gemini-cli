import fs from 'fs'; // Used for sync checks in validation
import fsPromises from 'fs/promises'; // Used for async operations in fallback
import path from 'path';
import { EOL } from 'os'; // Used for parsing grep output lines
import { spawn } from 'child_process'; // Used for git grep and system grep
import fastGlob from 'fast-glob'; // Used for JS fallback file searching
import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';

// --- Interfaces (kept separate for clarity) ---

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
}

/**
 * Result object for a single grep match
 */
interface GrepMatch {
  filePath: string;
  lineNumber: number;
  line: string;
}

// --- GrepTool Class ---

/**
 * Implementation of the GrepTool that searches file contents using git grep, system grep, or JS fallback.
 */
export class GrepTool extends BaseTool<GrepToolParams, ToolResult> {
  private rootDirectory: string;

  /**
   * Creates a new instance of the GrepTool
   * @param rootDirectory Root directory to ground this tool in. All operations will be restricted to this directory.
   */
  constructor(rootDirectory: string) {
    super(
      'search_file_content',
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
  invalidParams(params: GrepToolParams): string | null {
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
      return `Invalid regular expression pattern provided: ${params.pattern}. Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    try {
      this.resolveAndValidatePath(params.path);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }

    return null; // Parameters are valid
  }

  // --- Core Execution ---

  /**
   * Executes the grep search with the given parameters
   * @param params Parameters for the grep search
   * @returns Result of the grep search
   */
  async execute(params: GrepToolParams): Promise<ToolResult> {
    const validationError = this.invalidParams(params);
    if (validationError) {
      console.error(`GrepTool Parameter Validation Failed: ${validationError}`);
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `**Error:** Failed to execute tool.`,
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
      });

      if (matches.length === 0) {
        const noMatchMsg = `No matches found for pattern "${params.pattern}" in path "${searchDirDisplay}"${params.include ? ` (filter: "${params.include}")` : ''}.`;
        const noMatchUser = `No matches found`;
        return { llmContent: noMatchMsg, returnDisplay: noMatchUser };
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

      let llmContent = `Found ${matches.length} match(es) for pattern "${params.pattern}" in path "${searchDirDisplay}"${params.include ? ` (filter: "${params.include}")` : ''}:\n---\n`;

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
        returnDisplay: `Found ${matches.length} matche(s)`,
      };
    } catch (error) {
      console.error(`Error during GrepTool execution: ${error}`);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error during grep search operation: ${errorMessage}`,
        returnDisplay: errorMessage,
      };
    }
  }

  // --- Inlined Grep Logic and Helpers ---

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
   * Checks if a directory or its parent directories contain a .git folder.
   * @param {string} dirPath Absolute path to the directory to check.
   * @returns {Promise<boolean>} True if it's a Git repository, false otherwise.
   */
  private async isGitRepository(dirPath: string): Promise<boolean> {
    let currentPath = path.resolve(dirPath);
    const root = path.parse(currentPath).root;

    try {
      while (true) {
        const gitPath = path.join(currentPath, '.git');
        try {
          const stats = await fsPromises.stat(gitPath);
          if (stats.isDirectory() || stats.isFile()) {
            return true;
          }
          return false;
        } catch (error: unknown) {
          if (!isNodeError(error) || error.code !== 'ENOENT') {
            console.error(
              `Error checking for .git in ${currentPath}: ${error}`,
            );
            return false;
          }
        }

        if (currentPath === root) {
          break;
        }
        currentPath = path.dirname(currentPath);
      }
    } catch (error: unknown) {
      console.error(
        `Error traversing directory structure upwards from ${dirPath}: ${error instanceof Error ? error.message : error}`,
      );
    }
    return false;
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
      if (firstColonIndex === -1) {
        // Malformed line: Does not contain any colon. Skip.
        continue;
      }

      // Find the index of the second colon, searching *after* the first one.
      const secondColonIndex = line.indexOf(':', firstColonIndex + 1);
      if (secondColonIndex === -1) {
        // Malformed line: Contains only one colon (e.g., filename:content). Skip.
        // Grep output with -n should always have file:line:content.
        continue;
      }

      // Extract parts based on the found colon indices
      const filePathRaw = line.substring(0, firstColonIndex);
      const lineNumberStr = line.substring(
        firstColonIndex + 1,
        secondColonIndex,
      );
      // The rest of the line, starting after the second colon, is the content.
      const lineContent = line.substring(secondColonIndex + 1);

      const lineNumber = parseInt(lineNumberStr, 10);

      if (!isNaN(lineNumber)) {
        // Resolve the raw path relative to the base path where grep ran
        const absoluteFilePath = path.resolve(basePath, filePathRaw);
        // Make the final path relative to the basePath for consistency
        const relativeFilePath = path.relative(basePath, absoluteFilePath);

        results.push({
          // Use relative path, or just the filename if it's in the base path itself
          filePath: relativeFilePath || path.basename(absoluteFilePath),
          lineNumber,
          line: lineContent, // Use the full extracted line content
        });
      }
      // Silently ignore lines where the line number isn't parsable
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
      const searchDir = params.path || this.rootDirectory;
      const relativePath = makeRelative(searchDir, this.rootDirectory);
      description += ` within ${shortenPath(relativePath || './')}`;
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
  }): Promise<GrepMatch[]> {
    const { pattern, path: absolutePath, include } = options;
    let strategyUsed = 'none'; // Keep track for potential error reporting

    try {
      // --- Strategy 1: git grep ---
      const isGit = await this.isGitRepository(absolutePath);
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
        if (include) {
          gitArgs.push('--', include);
        }

        try {
          const output = await new Promise<string>((resolve, reject) => {
            const child = spawn('git', gitArgs, {
              cwd: absolutePath,
              windowsHide: true,
            });
            const stdoutChunks: Buffer[] = [];
            const stderrChunks: Buffer[] = [];

            child.stdout.on('data', (chunk) => {
              stdoutChunks.push(chunk);
            });
            child.stderr.on('data', (chunk) => {
              stderrChunks.push(chunk);
            });

            child.on('error', (err) =>
              reject(new Error(`Failed to start git grep: ${err.message}`)),
            );

            child.on('close', (code) => {
              const stdoutData = Buffer.concat(stdoutChunks).toString('utf8');
              const stderrData = Buffer.concat(stderrChunks).toString('utf8');
              if (code === 0) resolve(stdoutData);
              else if (code === 1)
                resolve(''); // No matches is not an error
              else
                reject(
                  new Error(`git grep exited with code ${code}: ${stderrData}`),
                );
            });
          });
          return this.parseGrepOutput(output, absolutePath);
        } catch (gitError: unknown) {
          console.error(
            `GrepTool: git grep strategy failed: ${getErrorMessage(gitError)}. Falling back...`,
          );
        }
      }

      // --- Strategy 2: System grep ---
      const grepAvailable = await this.isCommandAvailable('grep');
      if (grepAvailable) {
        strategyUsed = 'system grep';
        const grepArgs = ['-r', '-n', '-H', '-E'];
        const commonExcludes = ['.git', 'node_modules', 'bower_components'];
        commonExcludes.forEach((dir) => grepArgs.push(`--exclude-dir=${dir}`));
        if (include) {
          grepArgs.push(`--include=${include}`);
        }
        grepArgs.push(pattern);
        grepArgs.push('.');

        try {
          const output = await new Promise<string>((resolve, reject) => {
            const child = spawn('grep', grepArgs, {
              cwd: absolutePath,
              windowsHide: true,
            });
            const stdoutChunks: Buffer[] = [];
            const stderrChunks: Buffer[] = [];

            child.stdout.on('data', (chunk) => {
              stdoutChunks.push(chunk);
            });
            child.stderr.on('data', (chunk) => {
              const stderrStr = chunk.toString();
              if (
                !stderrStr.includes('Permission denied') &&
                !/grep:.*: Is a directory/i.test(stderrStr)
              ) {
                stderrChunks.push(chunk);
              }
            });

            child.on('error', (err) =>
              reject(new Error(`Failed to start system grep: ${err.message}`)),
            );

            child.on('close', (code) => {
              const stdoutData = Buffer.concat(stdoutChunks).toString('utf8');
              const stderrData = Buffer.concat(stderrChunks)
                .toString('utf8')
                .trim();
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
                else resolve('');
              }
            });
          });
          return this.parseGrepOutput(output, absolutePath);
        } catch (grepError: unknown) {
          console.error(
            `GrepTool: System grep strategy failed: ${getErrorMessage(grepError)}. Falling back...`,
          );
        }
      }

      // --- Strategy 3: Pure JavaScript Fallback ---
      strategyUsed = 'javascript fallback';
      const globPattern = include ? include : '**/*';
      const ignorePatterns = [
        '.git',
        'node_modules',
        'bower_components',
        '.svn',
        '.hg',
      ];

      const filesStream = fastGlob.stream(globPattern, {
        cwd: absolutePath,
        dot: true,
        ignore: ignorePatterns,
        absolute: true,
        onlyFiles: true,
        suppressErrors: true,
        stats: false,
      });

      const regex = new RegExp(pattern, 'i');
      const allMatches: GrepMatch[] = [];

      for await (const filePath of filesStream) {
        const fileAbsolutePath = filePath as string;
        try {
          const content = await fsPromises.readFile(fileAbsolutePath, 'utf8');
          const lines = content.split(/\r?\n/);
          lines.forEach((line, index) => {
            if (regex.test(line)) {
              allMatches.push({
                filePath:
                  path.relative(absolutePath, fileAbsolutePath) ||
                  path.basename(fileAbsolutePath),
                lineNumber: index + 1,
                line,
              });
            }
          });
        } catch (readError: unknown) {
          if (!isNodeError(readError) || readError.code !== 'ENOENT') {
            console.error(
              `GrepTool: Could not read or process file ${fileAbsolutePath}: ${getErrorMessage(readError)}`,
            );
          }
        }
      }

      return allMatches;
    } catch (error: unknown) {
      console.error(
        `GrepTool: Error during performGrepSearch (Strategy: ${strategyUsed}): ${getErrorMessage(error)}`,
      );
      throw error; // Re-throw to be caught by the execute method's handler
    }
  }
}
