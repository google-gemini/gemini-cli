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
  } catch (_e) {
    if (isErrnoException(_e) && _e.code === 'ENOENT') {
      const parentDir = path.dirname(p);
      if (parentDir === p) {
        return p;
      }
      return path.join(tryRealpath(parentDir), path.basename(p));
    }
    throw _e;
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
        try {
          const backlinkPath = path.join(resolvedWorktreeGitDir, 'gitdir');
          const backlink = fs.readFileSync(backlinkPath, 'utf8').trim();
          // The backlink must resolve to the workspace's .git file
          if (tryRealpath(backlink) !== tryRealpath(gitPath)) {
            return {}; // Reject: backlink does not match our workspace
          }
        } catch (_e) {
          return {}; // Reject: valid worktrees must have a readable backlink
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
  } catch (_e) {
    // Ignore if .git doesn't exist, isn't readable, etc.
  }
  return {};
}

export function resolveAndValidatePath(
  requestedPath: string,
  allowedBoundaries: string[],
): string {
  const resolved = tryRealpath(requestedPath);

  const isAuthorized = allowedBoundaries.some((boundary) => {
    if (resolved === boundary) return true;
    const normalizedBoundary = boundary.endsWith(path.sep)
      ? boundary
      : boundary + path.sep;
    const normalizedResolved = resolved.endsWith(path.sep)
      ? resolved
      : resolved + path.sep;
    return normalizedResolved.startsWith(normalizedBoundary);
  });

  if (!isAuthorized) {
    throw new Error(
      `Sandbox Security Violation: Path escapes authorized boundaries: ${requestedPath} -> ${resolved}`,
    );
  }

  return resolved;
}
