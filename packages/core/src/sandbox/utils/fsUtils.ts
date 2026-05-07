/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveToRealPath } from '../../utils/paths.js';

export function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && 'code' in e;
}

export async function resolveGitWorktreePaths(workspacePath: string): Promise<{
  worktreeGitDir?: string;
  mainGitDir?: string;
}> {
  try {
    const gitPath = path.join(workspacePath, '.git');
    const gitStat = await fs.lstat(gitPath);
    if (gitStat.isFile()) {
      const gitContent = await fs.readFile(gitPath, 'utf8');
      const match = gitContent.match(/^gitdir:\s+(.+)$/m);
      if (match && match[1]) {
        let worktreeGitDir = match[1].trim();
        if (!path.isAbsolute(worktreeGitDir)) {
          worktreeGitDir = path.resolve(workspacePath, worktreeGitDir);
        }
        const resolvedWorktreeGitDir = resolveToRealPath(worktreeGitDir);

        // Security check: Verify the bidirectional link to prevent sandbox escape
        let isValid = false;
        try {
          const backlinkPath = path.join(resolvedWorktreeGitDir, 'gitdir');
          const backlink = (await fs.readFile(backlinkPath, 'utf8')).trim();
          // The backlink must resolve to the workspace's .git file
          if (resolveToRealPath(backlink) === resolveToRealPath(gitPath)) {
            isValid = true;
          }
        } catch {
          // Fallback for submodules: check core.worktree in config
          try {
            const configPath = path.join(resolvedWorktreeGitDir, 'config');
            const config = await fs.readFile(configPath, 'utf8');
            const match = config.match(/^\s*worktree\s*=\s*(.+)$/m);
            if (match && match[1]) {
              const worktreePath = path.resolve(
                resolvedWorktreeGitDir,
                match[1].trim(),
              );
              if (
                resolveToRealPath(worktreePath) ===
                resolveToRealPath(workspacePath)
              ) {
                isValid = true;
              }
            }
          } catch {
            // Ignore
          }
        }

        if (!isValid) {
          return {}; // Reject: valid worktrees/submodules must have a readable backlink
        }

        const mainGitDir = resolveToRealPath(
          path.dirname(path.dirname(resolvedWorktreeGitDir)),
        );
        return {
          worktreeGitDir: resolvedWorktreeGitDir,
          mainGitDir: mainGitDir.endsWith('.git') ? mainGitDir : undefined,
        };
      }
    }
  } catch {
    // Ignore if .git doesn't exist, isn't readable, etc.
  }
  return {};
}
