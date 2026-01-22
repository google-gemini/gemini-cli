/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { downloadRipGrep } from '@joshua.litt/get-ripgrep';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import type { Config } from '../config/config.js';
import { fileExists } from '../utils/fileUtils.js';
import { Storage } from '../config/storage.js';
import { GREP_TOOL_NAME } from './tool-names.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  FileExclusions,
  COMMON_DIRECTORY_EXCLUDES,
} from '../utils/ignorePatterns.js';
import { GeminiIgnoreParser } from '../utils/geminiIgnoreParser.js';

const DEFAULT_TOTAL_MAX_MATCHES = 20000;

function getRgCandidateFilenames(): readonly string[] {
  return process.platform === 'win32' ? ['rg.exe', 'rg'] : ['rg'];
}

async function resolveExistingRgPath(): Promise<string | null> {
  const binDir = Storage.getGlobalBinDir();
  for (const fileName of getRgCandidateFilenames()) {
    const candidatePath = path.join(binDir, fileName);
    if (await fileExists(candidatePath)) {
      return candidatePath;
    }
  }
  return null;
}

let ripgrepAcquisitionPromise: Promise<string | null> | null = null;

async function ensureRipgrepAvailable(): Promise<string | null> {
  const existingPath = await resolveExistingRgPath();
  if (existingPath) {
    return existingPath;
  }
  if (!ripgrepAcquisitionPromise) {
    ripgrepAcquisitionPromise = (async () => {
      try {
        await downloadRipGrep(Storage.getGlobalBinDir());
        return await resolveExistingRgPath();
      } finally {
        ripgrepAcquisitionPromise = null;
      }
    })();
  }
  return ripgrepAcquisitionPromise;
}

/**
 * Checks if `rg` exists, if not then attempt to download it.
 */
export async function canUseRipgrep(): Promise<boolean> {
  return (await ensureRipgrepAvailable()) !== null;
}

/**
 * Ensures `rg` is downloaded, or throws.
 */
export async function ensureRgPath(): Promise<string> {
  const downloadedPath = await ensureRipgrepAvailable();
  if (downloadedPath) {
    return downloadedPath;
  }
  throw new Error('Cannot use ripgrep.');
}

/**
 * Checks if a path is within the root directory and resolves it.
 * @param config The configuration object.
 * @param relativePath Path relative to the root directory (or undefined for root).
 * @returns The absolute path if valid and exists, or null if no path specified.
 * @throws {Error} If path is outside root, doesn't exist, or isn't a directory/file.
 */
function resolveAndValidatePath(
  config: Config,
  relativePath?: string,
): string | null {
  if (!relativePath) {
    return null;
  }

  const targetDir = config.getTargetDir();
  const targetPath = path.resolve(targetDir, relativePath);

  // Ensure the resolved path is within workspace boundaries
  const workspaceContext = config.getWorkspaceContext();
  if (!workspaceContext.isPathWithinWorkspace(targetPath)) {
    const directories = workspaceContext.getDirectories();
    throw new Error(
      `Path validation failed: Attempted path "${relativePath}" resolves outside the allowed workspace directories: ${directories.join(', ')}`,
    );
  }

  // Check existence and type after resolving
  try {
    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory() && !stats.isFile()) {
      throw new Error(
        `Path is not a valid directory or file: ${targetPath} (CWD: ${targetDir})`,
      );
    }
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new Error(`Path does not exist: ${targetPath} (CWD: ${targetDir})`);
    }
    throw new Error(`Failed to access path stats for ${targetPath}: ${error}`);
  }

  return targetPath;
}

/**
 * Parameters for the GrepTool
 */
export interface RipGrepToolParams {
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
   * If true, searches case-sensitively. Defaults to false.
   */
  case_sensitive?: boolean;

  /**
   * If true, treats pattern as a literal string. Defaults to false.
   */
  fixed_strings?: boolean;

  /**
   * Show num lines of context around each match.
   */
  context?: number;

  /**
   * Show num lines after each match.
   */
  after?: number;

  /**
   * Show num lines before each match.
   */
  before?: number;

  /**
   * If true, does not respect .gitignore or default ignores (like build/dist).
   */
  no_ignore?: boolean;
}

/**
 * Result object for a single grep match
 */
interface GrepMatch {
  filePath: string;
  lineNumber: number;
  line: string;
}

class GrepToolInvocation extends BaseToolInvocation<
  RipGrepToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    private readonly geminiIgnoreParser: GeminiIgnoreParser,
    params: RipGrepToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      // Default to '.' if path is explicitly undefined/null.
      // This forces CWD search instead of 'all workspaces' search by default.
      const pathParam = this.params.dir_path || '.';

      const searchDirAbs = resolveAndValidatePath(this.config, pathParam);
      const searchDirDisplay = pathParam;

      const totalMaxMatches = DEFAULT_TOTAL_MAX_MATCHES;
      if (this.config.getDebugMode()) {
        debugLogger.log(`[GrepTool] Total result limit: ${totalMaxMatches}`);
      }

      let allMatches = await this.performRipgrepSearch({
        pattern: this.params.pattern,
        path: searchDirAbs!,
        include: this.params.include,
        case_sensitive: this.params.case_sensitive,
        fixed_strings: this.params.fixed_strings,
        context: this.params.context,
        after: this.params.after,
        before: this.params.before,
        no_ignore: this.params.no_ignore,
        signal,
      });

      if (allMatches.length >= totalMaxMatches) {
        allMatches = allMatches.slice(0, totalMaxMatches);
      }

      const searchLocationDescription = `in path "${searchDirDisplay}"`;
      if (allMatches.length === 0) {
        const noMatchMsg = `No matches found for pattern "${this.params.pattern}" ${searchLocationDescription}${this.params.include ? ` (filter: "${this.params.include}")` : ''}.`;
        return { llmContent: noMatchMsg, returnDisplay: `No matches found` };
      }

      const wasTruncated = allMatches.length >= totalMaxMatches;

      const matchesByFile = allMatches.reduce(
        (acc, match) => {
          const fileKey = match.filePath;
          if (!acc[fileKey]) {
            acc[fileKey] = [];
          }
          acc[fileKey].push(match);
          acc[fileKey].sort((a, b) => a.lineNumber - b.lineNumber);
          return acc;
        },
        {} as Record<string, GrepMatch[]>,
      );

      const matchCount = allMatches.length;
      const matchTerm = matchCount === 1 ? 'match' : 'matches';

      let llmContent = `Found ${matchCount} ${matchTerm} for pattern "${this.params.pattern}" ${searchLocationDescription}${this.params.include ? ` (filter: "${this.params.include}")` : ''}`;

      if (wasTruncated) {
        llmContent += ` (results limited to ${totalMaxMatches} matches for performance)`;
      }

      llmContent += `:\n---\n`;

      for (const filePath in matchesByFile) {
        llmContent += `File: ${filePath}\n`;
        matchesByFile[filePath].forEach((match) => {
          const trimmedLine = match.line.trim();
          llmContent += `L${match.lineNumber}: ${trimmedLine}\n`;
        });
        llmContent += '---\n';
      }

      let displayMessage = `Found ${matchCount} ${matchTerm}`;
      if (wasTruncated) {
        displayMessage += ` (limited)`;
      }

      return {
        llmContent: llmContent.trim(),
        returnDisplay: displayMessage,
      };
    } catch (error) {
      debugLogger.warn(`Error during GrepLogic execution: ${error}`);
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Error during grep search operation: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private parseRipgrepJsonOutput(
    output: string,
    basePath: string,
  ): GrepMatch[] {
    const results: GrepMatch[] = [];
    if (!output) return results;

    const lines = output.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line);
        if (json.type === 'match') {
          const match = json.data;
          // Defensive check: ensure text properties exist (skips binary/invalid encoding)
          if (match.path?.text && match.lines?.text) {
            const absoluteFilePath = path.resolve(basePath, match.path.text);
            const relativeFilePath = path.relative(basePath, absoluteFilePath);

            results.push({
              filePath: relativeFilePath || path.basename(absoluteFilePath),
              lineNumber: match.line_number,
              line: match.lines.text.trimEnd(),
            });
          }
        }
      } catch (error) {
        debugLogger.warn(`Failed to parse ripgrep JSON line: ${line}`, error);
      }
    }
    return results;
  }

  private async performRipgrepSearch(options: {
    pattern: string;
    path: string;
    include?: string;
    case_sensitive?: boolean;
    fixed_strings?: boolean;
    context?: number;
    after?: number;
    before?: number;
    no_ignore?: boolean;
    signal: AbortSignal;
  }): Promise<GrepMatch[]> {
    const {
      pattern,
      path: absolutePath,
      include,
      case_sensitive,
      fixed_strings,
      context,
      after,
      before,
      no_ignore,
    } = options;

    const rgArgs = ['--json'];

    if (!case_sensitive) {
      rgArgs.push('--ignore-case');
    }

    if (fixed_strings) {
      rgArgs.push('--fixed-strings');
      rgArgs.push(pattern);
    } else {
      rgArgs.push('--regexp', pattern);
    }

    if (context) {
      rgArgs.push('--context', context.toString());
    }
    if (after) {
      rgArgs.push('--after-context', after.toString());
    }
    if (before) {
      rgArgs.push('--before-context', before.toString());
    }
    if (no_ignore) {
      rgArgs.push('--no-ignore');
    }

    if (include) {
      rgArgs.push('--glob', include);
    }

    if (!no_ignore) {
      const fileExclusions = new FileExclusions(this.config);
      const excludes = fileExclusions.getGlobExcludes([
        ...COMMON_DIRECTORY_EXCLUDES,
        '*.log',
        '*.tmp',
      ]);
      excludes.forEach((exclude) => {
        rgArgs.push('--glob', `!${exclude}`);
      });

      if (this.config.getFileFilteringRespectGeminiIgnore()) {
        // Add .geminiignore support (ripgrep natively handles .gitignore)
        const geminiIgnorePath = this.geminiIgnoreParser.getIgnoreFilePath();
        if (geminiIgnorePath) {
          rgArgs.push('--ignore-file', geminiIgnorePath);
        }
      }
    }

    rgArgs.push('--threads', '4');
    rgArgs.push(absolutePath);

    try {
      const rgPath = await ensureRgPath();
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(rgPath, rgArgs, {
          windowsHide: true,
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        const cleanup = () => {
          if (options.signal.aborted) {
            child.kill();
          }
        };

        options.signal.addEventListener('abort', cleanup, { once: true });

        child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
        child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

        child.on('error', (err) => {
          options.signal.removeEventListener('abort', cleanup);
          reject(
            new Error(
              `Failed to start ripgrep: ${err.message}. Please ensure @lvce-editor/ripgrep is properly installed.`,
            ),
          );
        });

        child.on('close', (code) => {
          options.signal.removeEventListener('abort', cleanup);
          const stdoutData = Buffer.concat(stdoutChunks).toString('utf8');
          const stderrData = Buffer.concat(stderrChunks).toString('utf8');

          if (code === 0) {
            resolve(stdoutData);
          } else if (code === 1) {
            resolve(''); // No matches found
          } else {
            reject(
              new Error(`ripgrep exited with code ${code}: ${stderrData}`),
            );
          }
        });
      });

      return this.parseRipgrepJsonOutput(output, absolutePath);
    } catch (error: unknown) {
      debugLogger.debug(`GrepLogic: ripgrep failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Gets a description of the grep operation
   * @param params Parameters for the grep operation
   * @returns A string describing the grep
   */
  getDescription(): string {
    let description = `'${this.params.pattern}'`;
    if (this.params.include) {
      description += ` in ${this.params.include}`;
    }
    const pathParam = this.params.dir_path || '.';
    const resolvedPath = path.resolve(this.config.getTargetDir(), pathParam);
    if (resolvedPath === this.config.getTargetDir() || pathParam === '.') {
      description += ` within ./`;
    } else {
      const relativePath = makeRelative(
        resolvedPath,
        this.config.getTargetDir(),
      );
      description += ` within ${shortenPath(relativePath)}`;
    }
    return description;
  }
}

/**
 * Implementation of the Grep tool logic (moved from CLI)
 */
export class RipGrepTool extends BaseDeclarativeTool<
  RipGrepToolParams,
  ToolResult
> {
  static readonly Name = GREP_TOOL_NAME;
  private readonly geminiIgnoreParser: GeminiIgnoreParser;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      RipGrepTool.Name,
      'SearchText',
      'FAST, optimized search powered by `ripgrep`. PREFERRED over standard `run_shell_command("grep ...")` due to better performance and automatic output limiting (max 20k matches).',
      Kind.Search,
      {
        properties: {
          pattern: {
            description:
              "The pattern to search for. By default, treated as a Rust-flavored regular expression. Use '\\b' for precise symbol matching (e.g., '\\bMatchMe\\b').",
            type: 'string',
          },
          dir_path: {
            description:
              "Directory or file to search. Directories are searched recursively. Relative paths are resolved against current working directory. Defaults to current working directory ('.') if omitted.",
            type: 'string',
          },
          include: {
            description:
              "Glob pattern to filter files (e.g., '*.ts', 'src/**'). Recommended for large repositories to reduce noise. Defaults to all files if omitted.",
            type: 'string',
          },
          case_sensitive: {
            description:
              'If true, search is case-sensitive. Defaults to false (ignore case) if omitted.',
            type: 'boolean',
          },
          fixed_strings: {
            description:
              'If true, treats the `pattern` as a literal string instead of a regular expression. Defaults to false (basic regex) if omitted.',
            type: 'boolean',
          },
          context: {
            description:
              'Show this many lines of context around each match (equivalent to grep -C). Defaults to 0 if omitted.',
            type: 'integer',
          },
          after: {
            description:
              'Show this many lines after each match (equivalent to grep -A). Defaults to 0 if omitted.',
            type: 'integer',
          },
          before: {
            description:
              'Show this many lines before each match (equivalent to grep -B). Defaults to 0 if omitted.',
            type: 'integer',
          },
          no_ignore: {
            description:
              'If true, searches all files including those usually ignored (like in .gitignore, build/, dist/, etc). Defaults to false if omitted.',
            type: 'boolean',
          },
        },
        required: ['pattern'],
        type: 'object',
      },
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
    this.geminiIgnoreParser = new GeminiIgnoreParser(config.getTargetDir());
  }

  /**
   * Validates the parameters for the tool
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  override validateToolParams(params: RipGrepToolParams): string | null {
    const errors = SchemaValidator.validate(
      this.schema.parametersJsonSchema,
      params,
    );
    if (errors) {
      return errors;
    }

    // Only validate path if one is provided
    if (params.dir_path) {
      try {
        resolveAndValidatePath(this.config, params.dir_path);
      } catch (error) {
        return getErrorMessage(error);
      }
    }

    return null; // Parameters are valid
  }

  protected createInvocation(
    params: RipGrepToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<RipGrepToolParams, ToolResult> {
    return new GrepToolInvocation(
      this.config,
      this.geminiIgnoreParser,
      params,
      messageBus ?? this.messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
