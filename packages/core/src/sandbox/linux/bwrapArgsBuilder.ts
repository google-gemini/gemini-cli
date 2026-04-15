/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { join, dirname } from 'node:path';
import {
  GOVERNANCE_FILES,
  getSecretFileFindArgs,
  type ResolvedSandboxPaths,
} from '../../services/sandboxManager.js';
import { isErrnoException } from '../utils/fsUtils.js';
import { spawnAsync } from '../../utils/shell-utils.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Options for building bubblewrap (bwrap) arguments.
 */
export interface BwrapArgsOptions {
  resolvedPaths: ResolvedSandboxPaths;
  workspaceWrite: boolean;
  networkAccess: boolean;
  maskFilePath: string;
  isReadOnlyCommand: boolean;
}

/**
 * Builds the list of bubblewrap arguments based on the provided options.
 */
export async function buildBwrapArgs(
  options: BwrapArgsOptions,
): Promise<string[]> {
  const {
    resolvedPaths,
    workspaceWrite,
    networkAccess,
    maskFilePath,
    isReadOnlyCommand,
  } = options;
  const { workspace } = resolvedPaths;

  const bwrapArgs: string[] = [
    '--unshare-all',
    '--new-session', // Isolate session
    '--die-with-parent', // Prevent orphaned runaway processes
  ];

  if (networkAccess) {
    bwrapArgs.push('--share-net');
  }

  bwrapArgs.push(
    '--ro-bind',
    '/',
    '/',
    '--dev', // Creates a safe, minimal /dev (replaces --dev-bind)
    '/dev',
    '--proc', // Creates a fresh procfs for the unshared PID namespace
    '/proc',
    '--tmpfs', // Provides an isolated, writable /tmp directory
    '/tmp',
  );

  const bindFlag = workspaceWrite ? '--bind-try' : '--ro-bind-try';

  bwrapArgs.push(bindFlag, workspace.original, workspace.original);
  if (workspace.resolved !== workspace.original) {
    bwrapArgs.push(bindFlag, workspace.resolved, workspace.resolved);
  }

  for (const includeDir of resolvedPaths.globalIncludes) {
    bwrapArgs.push('--ro-bind-try', includeDir, includeDir);
  }

  for (const allowedPath of resolvedPaths.policyAllowed) {
    if (fs.existsSync(allowedPath)) {
      bwrapArgs.push('--bind-try', allowedPath, allowedPath);
    } else {
      // If the path doesn't exist, we still want to allow access to its parent
      // to enable creating it.
      const parent = dirname(allowedPath);
      bwrapArgs.push(
        isReadOnlyCommand ? '--ro-bind-try' : '--bind-try',
        parent,
        parent,
      );
    }
  }

  for (const p of resolvedPaths.policyRead) {
    bwrapArgs.push('--ro-bind-try', p, p);
  }

  for (const p of resolvedPaths.policyWrite) {
    bwrapArgs.push('--bind-try', p, p);
  }

  for (const file of GOVERNANCE_FILES) {
    const filePath = join(workspace.original, file.path);
    const realPath = join(workspace.resolved, file.path);
    bwrapArgs.push('--ro-bind', filePath, filePath);
    if (realPath !== filePath) {
      bwrapArgs.push('--ro-bind', realPath, realPath);
    }
  }

  // Grant read-only access to git worktrees/submodules. We do this last in order to
  // ensure that these rules aren't overwritten by broader write policies.
  if (resolvedPaths.gitWorktree) {
    const { worktreeGitDir, mainGitDir } = resolvedPaths.gitWorktree;
    if (worktreeGitDir) {
      bwrapArgs.push('--ro-bind-try', worktreeGitDir, worktreeGitDir);
    }
    if (mainGitDir) {
      bwrapArgs.push('--ro-bind-try', mainGitDir, mainGitDir);
    }
  }

  for (const p of resolvedPaths.forbidden) {
    if (!fs.existsSync(p)) continue;
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        bwrapArgs.push('--tmpfs', p, '--remount-ro', p);
      } else {
        bwrapArgs.push('--ro-bind', '/dev/null', p);
      }
    } catch (e: unknown) {
      if (isErrnoException(e) && e.code === 'ENOENT') {
        bwrapArgs.push('--symlink', '/dev/null', p);
      } else {
        debugLogger.warn(
          `Failed to secure forbidden path ${p}: ${e instanceof Error ? e.message : String(e)}`,
        );
        bwrapArgs.push('--ro-bind', '/dev/null', p);
      }
    }
  }

  // Mask secret files (.env, .env.*)
  const secretArgs = await getSecretFilesArgs(resolvedPaths, maskFilePath);
  bwrapArgs.push(...secretArgs);

  return bwrapArgs;
}

/**
 * Generates bubblewrap arguments to mask secret files.
 */
async function getSecretFilesArgs(
  resolvedPaths: ResolvedSandboxPaths,
  maskPath: string,
): Promise<string[]> {
  const args: string[] = [];
  const searchDirs = new Set([
    resolvedPaths.workspace.original,
    resolvedPaths.workspace.resolved,
    ...resolvedPaths.policyAllowed,
    ...resolvedPaths.globalIncludes,
  ]);
  const findPatterns = getSecretFileFindArgs();

  for (const dir of searchDirs) {
    try {
      // Use the native 'find' command for performance and to catch nested secrets.
      // We limit depth to 3 to keep it fast while covering common nested structures.
      // We use -prune to skip heavy directories efficiently while matching dotfiles.
      const findResult = await spawnAsync('find', [
        dir,
        '-maxdepth',
        '3',
        '-type',
        'd',
        '(',
        '-name',
        '.git',
        '-o',
        '-name',
        'node_modules',
        '-o',
        '-name',
        '.venv',
        '-o',
        '-name',
        '__pycache__',
        '-o',
        '-name',
        'dist',
        '-o',
        '-name',
        'build',
        ')',
        '-prune',
        '-o',
        '-type',
        'f',
        ...findPatterns,
        '-print0',
      ]);

      const files = findResult.stdout.toString().split('\0');
      for (const file of files) {
        if (file.trim()) {
          args.push('--bind', maskPath, file.trim());
        }
      }
    } catch (e) {
      debugLogger.log(
        `LinuxSandboxManager: Failed to find or mask secret files in ${dir}`,
        e,
      );
    }
  }
  return args;
}
