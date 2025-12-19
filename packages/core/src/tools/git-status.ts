/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { GIT_STATUS_TOOL_NAME } from './tool-names.js';
import { getGitStatus } from '../utils/git-status-utils.js';
import type { Config } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';

export type GitStatusToolParams = Record<string, never>;

class GitStatusToolInvocation extends BaseToolInvocation<
  GitStatusToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: GitStatusToolParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return 'Get Git repository status (staged, unstaged, untracked files)';
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const status = await getGitStatus(this.config);

    if (status === null) {
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

    // Format for LLM
    const parts: string[] = [];
    parts.push(`Git Status: ${status.isClean ? 'Clean' : 'Has changes'}`);
    if (status.branch) {
      parts.push(`Branch: ${status.branch}`);
      if (status.tracking) {
        if (status.ahead === 0 && status.behind === 0) {
          parts.push(`Remote: up to date`);
        } else {
          const remoteParts: string[] = [];
          if (status.ahead > 0) {
            remoteParts.push(`ahead ${status.ahead}`);
          }
          if (status.behind > 0) {
            remoteParts.push(`behind ${status.behind}`);
          }
          if (remoteParts.length > 0) {
            parts.push(`Remote: ${remoteParts.join(', ')}`);
          }
        }
      }
    }
    parts.push(`\nStaged files (${status.staged.length}):`);
    if (status.staged.length > 0) {
      parts.push(status.staged.map((f) => `  ${f}`).join('\n'));
    } else {
      parts.push('  (none)');
    }
    parts.push(`\nUnstaged files (${status.unstaged.length}):`);
    if (status.unstaged.length > 0) {
      parts.push(status.unstaged.map((f) => `  ${f}`).join('\n'));
    } else {
      parts.push('  (none)');
    }
    parts.push(`\nUntracked files (${status.untracked.length}):`);
    if (status.untracked.length > 0) {
      parts.push(status.untracked.map((f) => `  ${f}`).join('\n'));
    } else {
      parts.push('  (none)');
    }
    parts.push(`\nConflicted files (${status.conflicted.length}):`);
    if (status.conflicted.length > 0) {
      parts.push(status.conflicted.map((f) => `  ${f}`).join('\n'));
    } else {
      parts.push('  (none)');
    }

    const llmContent = parts.join('\n');

    // Format for user display (more concise)
    const displayParts: string[] = [];
    if (status.branch) {
      displayParts.push(`Branch: ${status.branch}`);
    }
    if (status.isClean) {
      displayParts.push('Working tree clean');
    } else {
      const counts: string[] = [];
      if (status.staged.length > 0) {
        counts.push(`${status.staged.length} staged`);
      }
      if (status.unstaged.length > 0) {
        counts.push(`${status.unstaged.length} unstaged`);
      }
      if (status.untracked.length > 0) {
        counts.push(`${status.untracked.length} untracked`);
      }
      if (status.conflicted.length > 0) {
        counts.push(`${status.conflicted.length} conflicted`);
      }
      displayParts.push(counts.join(', '));
    }

    return {
      llmContent,
      returnDisplay: displayParts.join(' | '),
    };
  }
}

export class GitStatusTool extends BaseDeclarativeTool<
  GitStatusToolParams,
  ToolResult
> {
  static readonly Name = GIT_STATUS_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    super(
      GitStatusTool.Name,
      'GitStatus',
      'Get the current Git repository status, including staged, unstaged, and untracked files. Use this to understand what changes exist in the working directory before making commits or other Git operations.',
      Kind.Read,
      {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      true, // output is markdown
      false, // output cannot be updated
      messageBus,
    );
  }

  protected override validateToolParamValues(
    _params: GitStatusToolParams,
  ): string | null {
    // No parameters to validate
    return null;
  }

  protected createInvocation(
    params: GitStatusToolParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<GitStatusToolParams, ToolResult> {
    return new GitStatusToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
