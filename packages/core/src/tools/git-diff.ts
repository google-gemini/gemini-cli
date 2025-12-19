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
  getGitFileLists,
  type GitDiffOptions,
} from '../utils/git-diff-utils.js';
import type { Config } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';
import type {
  AnsiOutput,
  AnsiToken,
  AnsiLine,
} from '../utils/terminalSerializer.js';

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

interface FileDiffInfo {
  status: 'A' | 'M' | 'D' | 'R';
  filePath: string;
  added: number;
  removed: number;
  isStaged: boolean;
  hasBothStagedAndUnstaged: boolean;
  unstagedStatus?: 'A' | 'M' | 'D' | 'R';
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

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const options: GitDiffOptions = {
      staged: this.params.staged,
      paths: this.params.paths,
    };

    const result = await getGitDiff(this.config, options);

    if (result === null) {
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

    if (!result.hasChanges) {
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

    const fileLists = await getGitFileLists(this.config);
    let stagedFiles = new Set<string>();
    let unstagedFiles = new Set<string>();
    const defaultStaged = this.params.staged ?? false;

    if (fileLists) {
      stagedFiles = new Set(fileLists.staged);
      unstagedFiles = new Set(fileLists.unstaged);
    }

    let stagedDiff: string | null = null;
    let unstagedDiff: string | null = null;

    if (this.params.staged === undefined) {
      const stagedResult = await getGitDiff(this.config, { staged: true });
      const unstagedResult = await getGitDiff(this.config, { staged: false });
      stagedDiff = stagedResult?.diff ?? null;
      unstagedDiff = unstagedResult?.diff ?? null;
    }

    const fileDiffs = this.parseDiff(
      result.diff,
      stagedFiles,
      unstagedFiles,
      defaultStaged,
    );

    if (this.params.staged === undefined && stagedDiff && unstagedDiff) {
      const unstagedFileDiffs = this.parseDiff(
        unstagedDiff,
        unstagedFiles,
        new Set(),
        false,
      );
      const unstagedStatusMap = new Map<string, 'A' | 'M' | 'D' | 'R'>();
      const unstagedFilePaths = new Set<string>();
      for (const file of unstagedFileDiffs) {
        unstagedStatusMap.set(file.filePath, file.status);
        unstagedFilePaths.add(file.filePath);
      }

      for (const file of fileDiffs) {
        if (file.hasBothStagedAndUnstaged) {
          if (!unstagedFilePaths.has(file.filePath)) {
            file.hasBothStagedAndUnstaged = false;
          } else {
            const unstagedStatus = unstagedStatusMap.get(file.filePath);
            if (unstagedStatus && unstagedStatus !== file.status) {
              file.unstagedStatus = unstagedStatus;
            } else if (unstagedStatus) {
              file.unstagedStatus = undefined;
            }
          }
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

    let totalFilesFromStatus = fileDiffs.length;
    if (fileLists) {
      if (this.params.staged === true) {
        totalFilesFromStatus = fileLists.staged.length;
      } else if (this.params.staged === false) {
        totalFilesFromStatus = fileLists.unstaged.length;
      } else {
        if (stagedDiff && unstagedDiff) {
          const stagedFileDiffs = this.parseDiff(
            stagedDiff,
            stagedFiles,
            new Set(),
            true,
          );
          const unstagedFileDiffs = this.parseDiff(
            unstagedDiff,
            new Set(),
            unstagedFiles,
            false,
          );
          const allDiffFiles = new Set<string>();
          for (const file of stagedFileDiffs) {
            allDiffFiles.add(file.filePath);
          }
          for (const file of unstagedFileDiffs) {
            allDiffFiles.add(file.filePath);
          }
          totalFilesFromStatus = allDiffFiles.size;
        } else {
          const allStatusFiles = new Set([
            ...fileLists.staged,
            ...fileLists.unstaged,
          ]);
          totalFilesFromStatus = allStatusFiles.size;
        }
      }
    }

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

    const returnDisplay: AnsiOutput = ansiLines;

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
