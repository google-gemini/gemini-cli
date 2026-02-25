/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { downloadRipGrep } from '@joshua.litt/get-ripgrep';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolErrorType } from './tool-error.js';
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
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { execStreaming } from '../utils/shell-utils.js';
import {
  DEFAULT_TOTAL_MAX_MATCHES,
  DEFAULT_SEARCH_TIMEOUT_MS,
} from './constants.js';
import { RIP_GREP_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { type GrepMatch, formatGrepResults } from './grep-utils.js';

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
   * Optional: A regular expression pattern to exclude from the search results.
   */
  exclude_pattern?: string;

  /**
   * Optional: If true, only the file paths of the matches will be returned.
   */
  names_only?: boolean;

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
  RipGrepToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    private readonly fileDiscoveryService: FileDiscoveryService,
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

      const searchDirAbs = path.resolve(this.config.getTargetDir(), pathParam);
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

      // Check existence and type asynchronously
      try {
        const stats = await fsPromises.stat(searchDirAbs);
        if (!stats.isDirectory() && !stats.isFile()) {
          return {
            llmContent: `Path is not a valid directory or file: ${searchDirAbs}`,
            returnDisplay: 'Error: Path is not a valid directory or file.',
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
        return {
          llmContent: `Failed to access path stats for ${searchDirAbs}: ${getErrorMessage(error)}`,
          returnDisplay: 'Error: Failed to access path.',
        };
      }

      const searchDirDisplay = pathParam;

      const totalMaxMatches =
        this.params.total_max_matches ?? DEFAULT_TOTAL_MAX_MATCHES;
      if (this.config.getDebugMode()) {
        debugLogger.log(`[GrepTool] Total result limit: ${totalMaxMatches}`);
      }

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

      let allMatches: GrepMatch[];
      try {
        allMatches = await this.performRipgrepSearch({
          pattern: this.params.pattern,
          path: searchDirAbs,
          include: this.params.include,
          exclude_pattern: this.params.exclude_pattern,
          case_sensitive: this.params.case_sensitive,
          fixed_strings: this.params.fixed_strings,
          context: this.params.context,
          after: this.params.after,
          before: this.params.before,
          no_ignore: this.params.no_ignore,
          maxMatches: totalMaxMatches,
          max_matches_per_file: this.params.max_matches_per_file,
          signal: timeoutController.signal,
        });
      } finally {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onAbort);
      }

      if (!this.params.no_ignore) {
        const uniqueFiles = Array.from(
          new Set(allMatches.map((m) => m.filePath)),
        );
        const absoluteFilePaths = uniqueFiles.map((f) =>
          path.resolve(searchDirAbs, f),
        );
        const allowedFiles =
          this.fileDiscoveryService.filterFiles(absoluteFilePaths);
        const allowedSet = new Set(allowedFiles);
        allMatches = allMatches.filter((m) =>
          allowedSet.has(path.resolve(searchDirAbs, m.filePath)),
        );
      }

      const matchCount = allMatches.filter((m) => !m.isContext).length;
      allMatches = await this.enrichWithRipgrepAutoContext(
        allMatches,
        matchCount,
        totalMaxMatches,
        searchDirAbs,
        timeoutController.signal,
      );

      const searchLocationDescription = `in path "${searchDirDisplay}"`;

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
      };
    }
  }

  private async enrichWithRipgrepAutoContext(
    allMatches: GrepMatch[],
    matchCount: number,
    totalMaxMatches: number,
    searchDirAbs: string,
    signal: AbortSignal,
  ): Promise<GrepMatch[]> {
    if (
      matchCount >= 1 &&
      matchCount <= 3 &&
      !this.params.names_only &&
      this.params.context === undefined &&
      this.params.before === undefined &&
      this.params.after === undefined
    ) {
      const contextLines = matchCount === 1 ? 50 : 15;
      const uniqueFiles = Array.from(
        new Set(allMatches.map((m) => m.absolutePath)),
      );

      let enrichedMatches = await this.performRipgrepSearch({
        pattern: this.params.pattern,
        path: uniqueFiles,
        basePath: searchDirAbs,
        include: this.params.include,
        exclude_pattern: this.params.exclude_pattern,
        case_sensitive: this.params.case_sensitive,
        fixed_strings: this.params.fixed_strings,
        context: contextLines,
        no_ignore: this.params.no_ignore,
        maxMatches: totalMaxMatches,
        max_matches_per_file: this.params.max_matches_per_file,
        signal,
      });

      if (!this.params.no_ignore) {
        const allowedFiles = this.fileDiscoveryService.filterFiles(uniqueFiles);
        const allowedSet = new Set(allowedFiles);
        enrichedMatches = enrichedMatches.filter((m) =>
          allowedSet.has(m.absolutePath),
        );
      }

      // Set context to prevent grep-utils from doing the JS fallback auto-context
      this.params.context = contextLines;
      return enrichedMatches;
    }

    return allMatches;
  }

  private async performRipgrepSearch(options: {
    pattern: string;
    path: string | string[];
    basePath?: string;
    include?: string;
    exclude_pattern?: string;
    case_sensitive?: boolean;
    fixed_strings?: boolean;
    context?: number;
    after?: number;
    before?: number;
    no_ignore?: boolean;
    maxMatches: number;
    max_matches_per_file?: number;
    signal: AbortSignal;
  }): Promise<GrepMatch[]> {
    const {
      pattern,
      path,
      basePath,
      include,
      exclude_pattern,
      case_sensitive,
      fixed_strings,
      context,
      after,
      before,
      no_ignore,
      maxMatches,
      max_matches_per_file,
    } = options;

    const searchPaths = Array.isArray(path) ? path : [path];

    const rgArgs = ['--json'];

    if (!case_sensitive) {
      rgArgs.push('--ignore-case');
    }

    if (fixed_strings) {
      rgArgs.push('--fixed-strings');
    }

    rgArgs.push('--regexp', pattern);

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

    if (max_matches_per_file) {
      rgArgs.push('--max-count', max_matches_per_file.toString());
    }

    if (include) {
      rgArgs.push('--glob', include);
    }

    if (!no_ignore) {
      if (!this.config.getFileFilteringRespectGitIgnore()) {
        rgArgs.push('--no-ignore-vcs', '--no-ignore-exclude');
      }

      const fileExclusions = new FileExclusions(this.config);
      const excludes = fileExclusions.getGlobExcludes([
        ...COMMON_DIRECTORY_EXCLUDES,
        '*.log',
        '*.tmp',
      ]);
      excludes.forEach((exclude) => {
        rgArgs.push('--glob', `!${exclude}`);
      });

      // Add .geminiignore and custom ignore files support (if provided/mandated)
      // (ripgrep natively handles .gitignore)
      const geminiIgnorePaths = this.fileDiscoveryService.getIgnoreFilePaths();
      for (const ignorePath of geminiIgnorePaths) {
        rgArgs.push('--ignore-file', ignorePath);
      }
    }

    rgArgs.push('--threads', '4');
    rgArgs.push(...searchPaths);

    const results: GrepMatch[] = [];
    try {
      const rgPath = await ensureRgPath();
      const generator = execStreaming(rgPath, rgArgs, {
        signal: options.signal,
        allowedExitCodes: [0, 1],
      });

      let matchesFound = 0;
      let excludeRegex: RegExp | null = null;
      if (exclude_pattern) {
        excludeRegex = new RegExp(exclude_pattern, case_sensitive ? '' : 'i');
      }

      const parseBasePath = basePath || searchPaths[0];

      for await (const line of generator) {
        const match = this.parseRipgrepJsonLine(line, parseBasePath);
        if (match) {
          if (excludeRegex && excludeRegex.test(match.line)) {
            continue;
          }

          results.push(match);
          if (!match.isContext) {
            matchesFound++;
          }
          if (matchesFound >= maxMatches) {
            break;
          }
        }
      }

      return results;
    } catch (error: unknown) {
      debugLogger.debug(`GrepLogic: ripgrep failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  private parseRipgrepJsonLine(
    line: string,
    basePath: string,
  ): GrepMatch | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const json = JSON.parse(line);
      if (json.type === 'match' || json.type === 'context') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data = json.data;
        // Defensive check: ensure text properties exist (skips binary/invalid encoding)
        if (data.path?.text && data.lines?.text) {
          const absoluteFilePath = path.resolve(basePath, data.path.text);
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
            absolutePath: absoluteFilePath,
            filePath: relativeFilePath || path.basename(absoluteFilePath),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            lineNumber: data.line_number,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            line: data.lines.text.trimEnd(),
            isContext: json.type === 'context',
          };
        }
      }
    } catch (error) {
      // Only log if it's not a simple empty line or widely invalid
      if (line.trim().length > 0) {
        debugLogger.warn(
          `Failed to parse ripgrep JSON line: ${line.substring(0, 100)}...`,
          error,
        );
      }
    }
    return null;
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
  private readonly fileDiscoveryService: FileDiscoveryService;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      RipGrepTool.Name,
      'SearchText',
      RIP_GREP_DEFINITION.base.description!,
      Kind.Search,
      RIP_GREP_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
    this.fileDiscoveryService = new FileDiscoveryService(
      config.getTargetDir(),
      config.getFileFilteringOptions(),
    );
  }

  /**
   * Validates the parameters for the tool
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  protected override validateToolParamValues(
    params: RipGrepToolParams,
  ): string | null {
    if (!params.fixed_strings) {
      try {
        new RegExp(params.pattern);
      } catch (error) {
        return `Invalid regular expression pattern provided: ${params.pattern}. Error: ${getErrorMessage(error)}`;
      }
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

    // Only validate path if one is provided
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

      // Check existence and type
      try {
        const stats = fs.statSync(resolvedPath);
        if (!stats.isDirectory() && !stats.isFile()) {
          return `Path is not a valid directory or file: ${resolvedPath}`;
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
    params: RipGrepToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<RipGrepToolParams, ToolResult> {
    return new GrepToolInvocation(
      this.config,
      this.fileDiscoveryService,
      params,
      messageBus ?? this.messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(RIP_GREP_DEFINITION, modelId);
  }
}
