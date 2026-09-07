/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import type { Tool, ToolContext } from '../Tool.js';
import type { Capability } from '../../permissions/Capability.js';

export class GitInspectTool implements Tool {
  public readonly name = 'git_inspect';
  public readonly description = 'Inspect git status, diff, or recent commit history for the current workspace.';
  public readonly capability: Capability = 'git.status';

  public readonly parameters = {
    command: {
      type: 'string' as const,
      description: 'Git inspection command to run: "status", "diff", or "log".',
      required: true,
    },
    args: {
      type: 'string' as const,
      description: 'Optional additional arguments (e.g. "-n 5" for log, or a specific file path for diff).',
      required: false,
    },
  };

  public async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const subcommand = String(args['command'] || 'status').trim().toLowerCase();
    const extraArgs = String(args['args'] || '').trim();

    let cap: Capability = 'git.status';
    let gitCmd = 'git status -s';

    if (subcommand === 'diff') {
      cap = 'git.diff';
      gitCmd = extraArgs ? `git diff ${extraArgs}` : 'git diff';
    } else if (subcommand === 'log') {
      cap = 'git.log';
      gitCmd = extraArgs ? `git log ${extraArgs}` : 'git log -n 5 --oneline';
    } else if (subcommand === 'commit') {
      cap = 'git.commit'; // Will be denied by PermissionManager!
      gitCmd = 'git commit';
    }

    // Check capability explicitly for the chosen subcommand
    context.permissions.assertAllowed(cap);

    try {
      const output = execSync(gitCmd, {
        cwd: context.workspaceRoot,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return output.trim() || `(git ${subcommand} returned no output)`;
    } catch (err: unknown) {
      return `Git execution failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
