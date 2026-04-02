/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

export function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && 'code' in e;
}

export function tryRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch (e) {
    if (isErrnoException(e) && e.code === 'ENOENT') {
      const parentDir = path.dirname(p);
      if (parentDir === p) {
        return p;
      }
      return path.join(tryRealpath(parentDir), path.basename(p));
    }
    throw e;
  }
}

export function resolveGitWorktreePaths(workspacePath: string): {
  worktreeGitDir?: string;
  mainGitDir?: string;
} {
  try {
    const gitPath = path.join(workspacePath, '.git');
    const gitStat = fs.lstatSync(gitPath);
    if (gitStat.isFile()) {
      const gitContent = fs.readFileSync(gitPath, 'utf8');
      const match = gitContent.match(/^gitdir:\s+(.+)$/m);
      if (match && match[1]) {
        let worktreeGitDir = match[1].trim();
        if (!path.isAbsolute(worktreeGitDir)) {
          worktreeGitDir = path.resolve(workspacePath, worktreeGitDir);
        }
        const resolvedWorktreeGitDir = tryRealpath(worktreeGitDir);

        // Security check: Verify the bidirectional link to prevent sandbox escape
        let isValid = false;
        try {
          const backlinkPath = path.join(resolvedWorktreeGitDir, 'gitdir');
          const backlink = fs.readFileSync(backlinkPath, 'utf8').trim();
          // The backlink must resolve to the workspace's .git file
          if (tryRealpath(backlink) === tryRealpath(gitPath)) {
            isValid = true;
          }
        } catch {
          // Fallback for submodules: check core.worktree in config
          try {
            const configPath = path.join(resolvedWorktreeGitDir, 'config');
            const config = fs.readFileSync(configPath, 'utf8');
            const match = config.match(/^\s*worktree\s*=\s*(.+)$/m);
            if (match && match[1]) {
              const worktreePath = path.resolve(
                resolvedWorktreeGitDir,
                match[1].trim(),
              );
              if (tryRealpath(worktreePath) === tryRealpath(workspacePath)) {
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

        const mainGitDir = tryRealpath(
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
