/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git';
import type { Config } from '../config/config.js';
import { debugLogger } from './debugLogger.js';
import * as path from 'node:path';
import type {
  AnsiOutput,
  AnsiToken,
  AnsiLine,
} from '../utils/terminalSerializer.js';

export interface GitStatus {
  isRepo: boolean;
  isClean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  branch?: string;
  tracking?: string;
  ahead: number;
  behind: number;
}

export interface GitDiffOptions {
  /** If true, show only staged changes. If false, show unstaged changes. If undefined, show all changes. */
  staged?: boolean;
  /** Specific file paths to diff. If empty/undefined, diff all files. */
  paths?: string[];
}

export interface GitDiffResult {
  diff: string;
  hasChanges: boolean;
}

export interface GitFileLists {
  staged: string[];
  unstaged: string[];
}

/**
 * Information about a file in a git diff.
 */
export interface FileDiffInfo {
  status: 'A' | 'M' | 'D' | 'R';
  filePath: string;
  added: number;
  removed: number;
  isStaged: boolean;
  hasBothStagedAndUnstaged: boolean;
  unstagedStatus?: 'A' | 'M' | 'D' | 'R';
}

/**
 * Gets the Git status for the repository at the target directory.
 * @param config The application configuration
 * @returns Git status information, or null if not in a Git repository
 */
export async function getGitStatus(config: Config): Promise<GitStatus | null> {
  const targetDir = config.getTargetDir();
  const git: SimpleGit = simpleGit(targetDir);

  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return null;
    }

    const status: StatusResult = await git.status();

    return {
      isRepo: true,
      isClean: status.isClean(),
      staged: status.staged,
      unstaged: status.files
        .filter((file) => file.working_dir.trim() && file.working_dir !== '?')
        .map((file) => file.path),
      untracked: status.not_added,
      branch: status.current ?? undefined,
      tracking: status.tracking ?? undefined,
      ahead: status.ahead,
      behind: status.behind,
    };
  } catch (e) {
    // If git status fails, we're not in a repo or git is not available
    debugLogger.error('Failed to get git status', e);
    return null;
  }
}

/**
 * Gets the lists of staged and unstaged files for diff operations.
 * @param config The application configuration
 * @returns File lists, or null if not in a Git repository
 */
export async function getGitFileLists(
  config: Config,
): Promise<GitFileLists | null> {
  const gitStatus = await getGitStatus(config);
  if (!gitStatus) {
    return null;
  }
  return {
    staged: gitStatus.staged,
    unstaged: gitStatus.unstaged,
  };
}

/**
 * Sanitizes file paths to prevent path traversal attacks.
 * @param paths Array of file paths to sanitize
 * @param config The application configuration
 * @returns Array of sanitized paths that are within the workspace
 */
function sanitizePaths(paths: string[], config: Config): string[] {
  if (!paths || paths.length === 0) {
    return [];
  }

  const workspaceContext = config.getWorkspaceContext();
  const targetDir = config.getTargetDir();
  const sanitized: string[] = [];

  for (const filePath of paths) {
    // Reject paths with path traversal sequences
    if (filePath.includes('..') || path.isAbsolute(filePath)) {
      debugLogger.warn(
        `Rejected potentially unsafe path: ${filePath} (contains path traversal or is absolute)`,
      );
      continue;
    }

    // Resolve the path relative to the target directory
    const resolvedPath = path.resolve(targetDir, filePath);

    // Ensure the resolved path is within the workspace
    if (!workspaceContext.isPathWithinWorkspace(resolvedPath)) {
      debugLogger.warn(
        `Rejected path outside workspace: ${filePath} (resolves to ${resolvedPath})`,
      );
      continue;
    }

    sanitized.push(filePath);
  }

  return sanitized;
}

/**
 * Gets the Git diff for the repository at the target directory.
 * @param config The application configuration
 * @param options Options to control what diff to show
 * @returns Git diff information, or null if not in a Git repository
 */
export async function getGitDiff(
  config: Config,
  options: GitDiffOptions = {},
): Promise<GitDiffResult | null> {
  const targetDir = config.getTargetDir();
  const git: SimpleGit = simpleGit(targetDir);

  try {
    // Check if we're in a Git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return null;
    }

    // Sanitize paths to prevent path traversal attacks
    const sanitizedPaths = options.paths
      ? sanitizePaths(options.paths, config)
      : [];

    let diff: string;

    if (options.staged === true) {
      // Show only staged changes
      diff = await git.diff(['--staged', ...sanitizedPaths]);
    } else if (options.staged === false) {
      // Show only unstaged changes
      diff = await git.diff([...sanitizedPaths]);
    } else {
      // Show all changes (both staged and unstaged)
      diff = await git.diff(['HEAD', ...sanitizedPaths]);
    }

    return {
      diff,
      hasChanges: diff.length > 0,
    };
  } catch (e) {
    debugLogger.error('Failed to get git diff', e);
    return null;
  }
}

/**
 * Formats git diff file information into ANSI-colored terminal output.
 * @param fileDiffs Array of file diff information to format
 * @param changeType Type of changes being displayed ('staged', 'unstaged', or 'staged/unstaged')
 * @param totalFilesFromStatus Total number of files from git status (for "more files" indicator)
 * @returns Formatted ANSI output for terminal display
 */
export function formatGitDiffOutput(
  fileDiffs: FileDiffInfo[],
  changeType: string,
  totalFilesFromStatus: number,
): AnsiOutput {
  const ansiLines: AnsiLine[] = [];
  ansiLines.push([
    {
      text: `git-diff: ${fileDiffs.length} file${fileDiffs.length !== 1 ? 's' : ''} ${changeType}\n`,
      bold: false,
      italic: false,
      underline: false,
      dim: false,
      inverse: false,
      fg: '',
      bg: '',
    },
  ]);

  const createToken = (
    text: string,
    color: string,
    bold = false,
  ): AnsiToken => ({
    text,
    bold,
    italic: false,
    underline: false,
    dim: false,
    inverse: false,
    fg: color,
    bg: '',
  });

  const createPlainToken = (text: string): AnsiToken => createToken(text, '');

  for (const file of fileDiffs) {
    const line: AnsiToken[] = [];

    const statusLabels: string[] = [];
    const statusColors: string[] = [];

    switch (file.status) {
      case 'A':
        statusLabels.push('[A]');
        statusColors.push('green');
        break;
      case 'D':
        statusLabels.push('[D]');
        statusColors.push('red');
        break;
      case 'R':
        statusLabels.push('[R]');
        statusColors.push('yellow');
        break;
      case 'M':
      default:
        statusLabels.push('[M]');
        statusColors.push('cyan');
        break;
    }

    if (file.hasBothStagedAndUnstaged && file.unstagedStatus) {
      const unstagedStatus = file.unstagedStatus;
      if (unstagedStatus !== file.status) {
        switch (unstagedStatus) {
          case 'A':
            statusLabels.push('[A]');
            statusColors.push('green');
            break;
          case 'D':
            statusLabels.push('[D]');
            statusColors.push('red');
            break;
          case 'R':
            statusLabels.push('[R]');
            statusColors.push('yellow');
            break;
          case 'M':
          default:
            statusLabels.push('[M]');
            statusColors.push('cyan');
            break;
        }
      }
    }

    for (let i = 0; i < statusLabels.length; i++) {
      line.push(createToken(statusLabels[i], statusColors[i]));
    }
    line.push(createPlainToken('\t'));

    let filePathColor: string;
    let useStrikethrough = false;

    if (file.status === 'D') {
      filePathColor = 'red';
      useStrikethrough = true;
    } else if (file.hasBothStagedAndUnstaged) {
      filePathColor = 'yellow';
    } else if (file.isStaged) {
      filePathColor = 'green';
    } else {
      filePathColor = '';
    }

    const filePathText = useStrikethrough
      ? file.filePath
          .split('')
          .map((char) => char + '\u0336')
          .join('')
      : file.filePath;

    line.push(createToken(filePathText, filePathColor));

    if (file.added > 0 || file.removed > 0) {
      line.push(createPlainToken(' ['));

      if (file.added > 0) {
        line.push(createToken(`+${file.added}`, 'green'));
        if (file.removed > 0) {
          line.push(createPlainToken(' '));
        }
      }

      if (file.removed > 0) {
        line.push(createToken(`-${file.removed}`, 'red'));
      }

      line.push(createPlainToken(']'));
    }

    ansiLines.push(line);
  }

  // Add "+x more files" if there are files in git status that don't appear in diff
  if (totalFilesFromStatus > fileDiffs.length) {
    const moreCount = totalFilesFromStatus - fileDiffs.length;
    ansiLines.push([
      createPlainToken(
        `\n+${moreCount} more file${moreCount !== 1 ? 's' : ''}`,
      ),
    ]);
  }

  return ansiLines;
}
