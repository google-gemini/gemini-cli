/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BASE_SEATBELT_PROFILE,
  NETWORK_SEATBELT_PROFILE,
} from './baseProfile.js';
import {
  type SandboxPermissions,
  sanitizePaths,
  GOVERNANCE_FILES,
} from '../../services/sandboxManager.js';

/**
 * Options for building macOS Seatbelt arguments.
 */
export interface SeatbeltArgsOptions {
  /** The primary workspace path to allow access to. */
  workspace: string;
  /** Additional paths to allow access to. */
  allowedPaths?: string[];
  /** Absolute paths to explicitly deny read/write access to (overrides allowlists). */
  forbiddenPaths?: string[];
  /** Whether to allow network access. */
  networkAccess?: boolean;
  /** Granular additional permissions. */
  additionalPermissions?: SandboxPermissions;
  /** Whether to allow write access to the workspace. */
  workspaceWrite?: boolean;
}

/**
 * Resolves symlinks for a given path to prevent sandbox escapes.
 * If a file does not exist (ENOENT), it recursively resolves the parent directory.
 * Other errors (e.g. EACCES) are re-thrown.
 */
function tryRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
      const parentDir = path.dirname(p);
      if (parentDir === p) {
        return p;
      }
      return path.join(tryRealpath(parentDir), path.basename(p));
    }
    throw e;
  }
}

/**
 * Builds the arguments array for sandbox-exec using a strict allowlist profile.
 * It relies on parameters passed to sandbox-exec via the -D flag to avoid
 * string interpolation vulnerabilities, and normalizes paths against symlink escapes.
 *
 * Returns arguments up to the end of sandbox-exec configuration (e.g. ['-p', '<profile>', '-D', ...])
 * Does not include the final '--' separator or the command to run.
 */
export function buildSeatbeltArgs(options: SeatbeltArgsOptions): string[] {
  let profile = BASE_SEATBELT_PROFILE + '\n';
  const args: string[] = [];

  const workspacePath = tryRealpath(options.workspace);
  args.push('-D', `WORKSPACE=${workspacePath}`);
  args.push('-D', `WORKSPACE_RAW=${options.workspace}`);
  profile += `(allow file-read* (subpath (param "WORKSPACE_RAW")))\n`;
  if (options.workspaceWrite) {
    profile += `(allow file-write* (subpath (param "WORKSPACE_RAW")))\n`;
  }

  if (options.workspaceWrite) {
    profile += `(allow file-write* (subpath (param "WORKSPACE")))\n`;
  }

  // Add explicit deny rules for governance files in the workspace.
  // These are added after the workspace allow rule to ensure they take precedence
  // (Seatbelt evaluates rules in order, later rules win for same path).
  for (let i = 0; i < GOVERNANCE_FILES.length; i++) {
    const governanceFile = path.join(workspacePath, GOVERNANCE_FILES[i].path);
    const realGovernanceFile = tryRealpath(governanceFile);

    // Determine if it should be treated as a directory (subpath) or a file (literal).
    // .git is generally a directory, while ignore files are literals.
    let isDirectory = GOVERNANCE_FILES[i].isDirectory;
    try {
      if (fs.existsSync(realGovernanceFile)) {
        isDirectory = fs.lstatSync(realGovernanceFile).isDirectory();
      }
    } catch {
      // Ignore errors, use default guess
    }

    const ruleType = isDirectory ? 'subpath' : 'literal';

    args.push('-D', `GOVERNANCE_FILE_${i}=${governanceFile}`);
    profile += `(deny file-write* (${ruleType} (param "GOVERNANCE_FILE_${i}")))\n`;

    if (realGovernanceFile !== governanceFile) {
      args.push('-D', `REAL_GOVERNANCE_FILE_${i}=${realGovernanceFile}`);
      profile += `(deny file-write* (${ruleType} (param "REAL_GOVERNANCE_FILE_${i}")))\n`;
    }
  }

  // Auto-detect and support git worktrees by granting read and write access to the underlying git directory
  try {
    const gitPath = path.join(workspacePath, '.git');
    const gitStat = fs.lstatSync(gitPath);
    if (gitStat.isFile()) {
      const gitContent = fs.readFileSync(gitPath, 'utf8');
      const match = gitContent.match(/^gitdir:\s*(.+)$/m);
      if (match && match[1]) {
        let worktreeGitDir = match[1].trim();
        if (!path.isAbsolute(worktreeGitDir)) {
          worktreeGitDir = path.resolve(workspacePath, worktreeGitDir);
        }
        const resolvedWorktreeGitDir = tryRealpath(worktreeGitDir);

        // Grant write access to the worktree's specific .git directory
        args.push('-D', `WORKTREE_GIT_DIR=${resolvedWorktreeGitDir}`);
        profile += `(allow file-read* file-write* (subpath (param "WORKTREE_GIT_DIR")))\n`;

        // Grant write access to the main repository's .git directory (objects, refs, etc. are shared)
        // resolvedWorktreeGitDir is usually like: /path/to/main-repo/.git/worktrees/worktree-name
        const mainGitDir = tryRealpath(
          path.dirname(path.dirname(resolvedWorktreeGitDir)),
        );
        if (mainGitDir && mainGitDir.endsWith('.git')) {
          args.push('-D', `MAIN_GIT_DIR=${mainGitDir}`);
          profile += `(allow file-read* file-write* (subpath (param "MAIN_GIT_DIR")))\n`;
        }
      }
    }
  } catch (_e) {
    // Ignore if .git doesn't exist, isn't readable, etc.
  }

  const tmpPath = tryRealpath(os.tmpdir());
  args.push('-D', `TMPDIR=${tmpPath}`);

  const nodeRootPath = tryRealpath(
    path.dirname(path.dirname(process.execPath)),
  );
  args.push('-D', `NODE_ROOT=${nodeRootPath}`);
  profile += `(allow file-read* (subpath (param "NODE_ROOT")))\n`;

  // Add PATH directories as read-only to support nvm, homebrew, etc.
  if (process.env['PATH']) {
    const paths = process.env['PATH'].split(':');
    let pathIndex = 0;
    const addedPaths = new Set();

    for (const p of paths) {
      if (!p.trim()) continue;
      try {
        let resolved = tryRealpath(p);

        // If this is a 'bin' directory (like /usr/local/bin or homebrew/bin),
        // also grant read access to its parent directory so that symlinked
        // assets (like Cellar or libexec) can be read.
        if (resolved.endsWith('/bin')) {
          resolved = path.dirname(resolved);
        }

        if (!addedPaths.has(resolved)) {
          addedPaths.add(resolved);
          args.push('-D', `SYS_PATH_${pathIndex}=${resolved}`);
          profile += `(allow file-read* (subpath (param "SYS_PATH_${pathIndex}")))\n`;
          pathIndex++;
        }
      } catch (_e) {
        // Ignore paths that do not exist or are inaccessible
      }
    }
  }

  // Handle allowedPaths
  const allowedPaths = sanitizePaths(options.allowedPaths) || [];
  for (let i = 0; i < allowedPaths.length; i++) {
    const allowedPath = tryRealpath(allowedPaths[i]);
    args.push('-D', `ALLOWED_PATH_${i}=${allowedPath}`);
    profile += `(allow file-read* file-write* (subpath (param "ALLOWED_PATH_${i}")))\n`;
  }

  // Handle granular additional permissions
  if (options.additionalPermissions?.fileSystem) {
    const { read, write } = options.additionalPermissions.fileSystem;
    if (read) {
      read.forEach((p, i) => {
        const resolved = tryRealpath(p);
        const paramName = `ADDITIONAL_READ_${i}`;
        args.push('-D', `${paramName}=${resolved}`);
        let isFile = false;
        try {
          isFile = fs.statSync(resolved).isFile();
        } catch {
          // Ignore error
        }
        if (isFile) {
          profile += `(allow file-read* (literal (param "${paramName}")))\n`;
        } else {
          profile += `(allow file-read* (subpath (param "${paramName}")))\n`;
        }
      });
    }
    if (write) {
      write.forEach((p, i) => {
        const resolved = tryRealpath(p);
        const paramName = `ADDITIONAL_WRITE_${i}`;
        args.push('-D', `${paramName}=${resolved}`);
        let isFile = false;
        try {
          isFile = fs.statSync(resolved).isFile();
        } catch {
          // Ignore error
        }
        if (isFile) {
          profile += `(allow file-read* file-write* (literal (param "${paramName}")))\n`;
        } else {
          profile += `(allow file-read* file-write* (subpath (param "${paramName}")))\n`;
        }
      });
    }
  }

  // Handle forbiddenPaths
  const forbiddenPaths = sanitizePaths(options.forbiddenPaths) || [];
  for (let i = 0; i < forbiddenPaths.length; i++) {
    const forbiddenPath = tryRealpath(forbiddenPaths[i]);
    args.push('-D', `FORBIDDEN_PATH_${i}=${forbiddenPath}`);
    profile += `(deny file-read* file-write* (subpath (param "FORBIDDEN_PATH_${i}")))\n`;
  }

  if (options.networkAccess || options.additionalPermissions?.network) {
    profile += NETWORK_SEATBELT_PROFILE;
  }

  args.unshift('-p', profile);

  return args;
}
