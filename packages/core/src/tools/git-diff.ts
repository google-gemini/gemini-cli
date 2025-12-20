/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { GIT_DIFF_TOOL_NAME } from './tool-names.js';
import {
  getGitDiff,
  formatGitDiffOutput,
  type GitDiffOptions,
  type FileDiffInfo,
} from '../utils/git-diff-utils.js';
import type { Config } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';
import { simpleGit, type SimpleGit } from 'simple-git';

export interface GitDiffToolParams {
  /**
   * If true, show only staged changes.
   * If false, show only unstaged changes.
   * If not provided, show all changes.
   */
  staged?: boolean;

  /**
   * Optional array of file paths to limit the diff to specific files.
   */
  paths?: string[];
}

class GitDiffToolInvocation extends BaseToolInvocation<
  GitDiffToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: GitDiffToolParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const { staged, paths } = this.params;

    let desc = 'View unified diff for ';
    if (staged === true) {
      desc += 'staged changes';
    } else if (staged === false) {
      desc += 'unstaged changes';
    } else {
      desc += 'all changes';
    }

    if (paths && paths.length > 0) {
      desc += ` in ${paths.join(', ')}`;
    }

    return desc;
  }

  private parseDiff(
    diff: string,
    stagedFiles: Set<string>,
    unstagedFiles: Set<string>,
    defaultStaged: boolean,
  ): FileDiffInfo[] {
    const lines = diff.split('\n');
    const files: FileDiffInfo[] = [];
    let currentFile: FileDiffInfo | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('diff --git')) {
        if (currentFile) {
          files.push(currentFile);
        }

        const match = line.match(/diff --git a\/(.+?) b\/(.+?)$/);
        if (match) {
          const oldPath = match[1];
          const newPath = match[2];
          const filePath = newPath !== '/dev/null' ? newPath : oldPath;

          const isInStaged = stagedFiles.has(filePath);
          const isInUnstaged = unstagedFiles.has(filePath);
          const hasBoth = isInStaged && isInUnstaged;
          let isStaged = defaultStaged;
          if (isInStaged) {
            isStaged = true;
          } else if (isInUnstaged) {
            isStaged = false;
          }

          if (
            oldPath !== newPath &&
            oldPath !== '/dev/null' &&
            newPath !== '/dev/null'
          ) {
            currentFile = {
              status: 'R',
              filePath,
              added: 0,
              removed: 0,
              isStaged,
              hasBothStagedAndUnstaged: hasBoth,
            };
          } else {
            currentFile = {
              status: 'M',
              filePath,
              added: 0,
              removed: 0,
              isStaged,
              hasBothStagedAndUnstaged: hasBoth,
            };
          }
        }
      }

      if (line.startsWith('new file mode')) {
        if (currentFile) {
          currentFile.status = 'A';
        }
      }

      if (line.startsWith('deleted file mode')) {
        if (currentFile) {
          currentFile.status = 'D';
        }
      }
      if (currentFile) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentFile.added++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentFile.removed++;
        }
      }
    }

    if (currentFile) {
      files.push(currentFile);
    }

    return files;
  }

  /**
   * Converts a git status code to our status type.
   */
  private getStatusFromCode(code: string): 'A' | 'M' | 'D' | 'R' {
    if (code === 'A' || code.startsWith('A')) return 'A';
    if (code === 'D' || code.startsWith('D')) return 'D';
    if (code === 'R' || code.startsWith('R')) return 'R';
    return 'M'; // Modified or any other change
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const targetDir = this.config.getTargetDir();
    const git: SimpleGit = simpleGit(targetDir);
    let status;
    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        return {
          llmContent:
            'Not in a Git repository. The current directory is not a Git repository.',
          returnDisplay:
            'Not in a Git repository. The current directory is not a Git repository.',
          error: {
            message: 'Not in a Git repository',
            type: ToolErrorType.GIT_NOT_REPO,
          },
        };
      }
      status = await git.status();
    } catch {
      return {
        llmContent:
          'Not in a Git repository. The current directory is not a Git repository.',
        returnDisplay:
          'Not in a Git repository. The current directory is not a Git repository.',
        error: {
          message: 'Not in a Git repository',
          type: ToolErrorType.GIT_NOT_REPO,
        },
      };
    }

    // Build file lists from status.files
    const stagedFiles = new Set<string>();
    const unstagedFiles = new Set<string>();
    const fileStatusMap = new Map<
      string,
      { staged?: 'A' | 'M' | 'D' | 'R'; unstaged?: 'A' | 'M' | 'D' | 'R' }
    >();

    for (const file of status.files) {
      const filePath = file.path;
      const hasStaged = file.index.trim() && file.index !== '?';
      const hasUnstaged = file.working_dir.trim() && file.working_dir !== '?';

      if (hasStaged) {
        stagedFiles.add(filePath);
        fileStatusMap.set(filePath, {
          ...fileStatusMap.get(filePath),
          staged: this.getStatusFromCode(file.index),
        });
      }

      if (hasUnstaged) {
        unstagedFiles.add(filePath);
        fileStatusMap.set(filePath, {
          ...fileStatusMap.get(filePath),
          unstaged: this.getStatusFromCode(file.working_dir),
        });
      }
    }

    // Filter files based on staged parameter
    let relevantFiles: string[] = [];
    if (this.params.staged === true) {
      relevantFiles = Array.from(stagedFiles);
    } else if (this.params.staged === false) {
      relevantFiles = Array.from(unstagedFiles);
    } else {
      // All changes: union of staged and unstaged
      relevantFiles = Array.from(new Set([...stagedFiles, ...unstagedFiles]));
    }

    if (relevantFiles.length === 0) {
      const noDiffMessage =
        this.params.staged === true
          ? 'No staged changes to show.'
          : this.params.staged === false
            ? 'No unstaged changes to show.'
            : 'No changes to show.';

      return {
        llmContent: noDiffMessage,
        returnDisplay: noDiffMessage,
      };
    }

    // Make a single git diff call
    const options: GitDiffOptions = {
      staged: this.params.staged,
      paths: this.params.paths,
    };

    const result = await getGitDiff(this.config, options);

    if (result === null || !result.hasChanges) {
      const noDiffMessage =
        this.params.staged === true
          ? 'No staged changes to show.'
          : this.params.staged === false
            ? 'No unstaged changes to show.'
            : 'No changes to show.';

      return {
        llmContent: noDiffMessage,
        returnDisplay: noDiffMessage,
      };
    }

    const diffType =
      this.params.staged === true
        ? 'Staged'
        : this.params.staged === false
          ? 'Unstaged'
          : 'All';

    const header = `${diffType} changes diff:\n\n`;
    const llmContent = header + result.diff;

    const defaultStaged = this.params.staged ?? false;
    const fileDiffs = this.parseDiff(
      result.diff,
      stagedFiles,
      unstagedFiles,
      defaultStaged,
    );

    // Enhance file diffs with status information from status.files
    for (const fileDiff of fileDiffs) {
      const statusInfo = fileStatusMap.get(fileDiff.filePath);
      if (statusInfo) {
        // Update status from ground truth if available
        if (fileDiff.isStaged && statusInfo.staged) {
          fileDiff.status = statusInfo.staged;
        } else if (!fileDiff.isStaged && statusInfo.unstaged) {
          fileDiff.status = statusInfo.unstaged;
        }

        // Set unstaged status if file has both staged and unstaged changes
        if (
          fileDiff.hasBothStagedAndUnstaged &&
          statusInfo.unstaged &&
          statusInfo.unstaged !== fileDiff.status
        ) {
          fileDiff.unstagedStatus = statusInfo.unstaged;
        }
      }
    }

    let changeType: string;
    if (this.params.staged === true) {
      changeType = 'staged';
    } else if (this.params.staged === false) {
      changeType = 'unstaged';
    } else {
      const allStaged = fileDiffs.every((f) => f.isStaged);
      const allUnstaged = fileDiffs.every((f) => !f.isStaged);
      if (allStaged) {
        changeType = 'staged';
      } else if (allUnstaged) {
        changeType = 'unstaged';
      } else {
        changeType = 'staged/unstaged';
      }
    }

    // Calculate total files from status
    const totalFilesFromStatus = relevantFiles.length;

    // Format the output using the utility function
    const returnDisplay = formatGitDiffOutput(
      fileDiffs,
      changeType,
      totalFilesFromStatus,
    );

    return {
      llmContent,
      returnDisplay,
    };
  }
}

export class GitDiffTool extends BaseDeclarativeTool<
  GitDiffToolParams,
  ToolResult
> {
  static readonly Name = GIT_DIFF_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    super(
      GitDiffTool.Name,
      'GitDiff',
      'View unified diffs for staged or unstaged changes in the Git repository. Shows file status (Added, Modified, Deleted, Renamed) and line change statistics.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          staged: {
            type: 'boolean',
            description:
              'If true, show only staged changes. If false, show only unstaged changes. If not provided, show all changes.',
          },
          paths: {
            type: 'array',
            items: {
              type: 'string',
            },
            description:
              'Optional array of file paths to limit the diff to specific files.',
          },
        },
        additionalProperties: false,
      },
      true, // output is markdown
      false, // output cannot be updated
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: GitDiffToolParams,
  ): string | null {
    if (params.paths && !Array.isArray(params.paths)) {
      return 'paths must be an array of strings';
    }

    if (params.paths && params.paths.some((p) => typeof p !== 'string')) {
      return 'All paths must be strings';
    }

    return null;
  }

  protected createInvocation(
    params: GitDiffToolParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<GitDiffToolParams, ToolResult> {
    return new GitDiffToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
