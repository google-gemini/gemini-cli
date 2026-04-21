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
import { toPathKey } from '../../utils/paths.js';

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

  type MountType =
    | '--bind'
    | '--ro-bind'
    | '--bind-try'
    | '--ro-bind-try'
    | '--symlink';

  type Mount =
    | {
        type: MountType;
        src: string;
        dest: string;
      }
    | { type: '--tmpfs-ro'; dest: string };

  const mounts: Mount[] = [];

  const bindFlag: MountType = workspaceWrite ? '--bind-try' : '--ro-bind-try';
  mounts.push({
    type: bindFlag,
    src: workspace.original,
    dest: workspace.original,
  });
  if (workspace.resolved !== workspace.original) {
    mounts.push({
      type: bindFlag,
      src: workspace.resolved,
      dest: workspace.resolved,
    });
  }

  for (const includeDir of resolvedPaths.globalIncludes) {
    mounts.push({ type: '--ro-bind-try', src: includeDir, dest: includeDir });
  }

  for (const allowedPath of resolvedPaths.policyAllowed) {
    if (fs.existsSync(allowedPath)) {
      mounts.push({ type: '--bind-try', src: allowedPath, dest: allowedPath });
    } else {
      const parent = dirname(allowedPath);
      mounts.push({
        type: isReadOnlyCommand ? '--ro-bind-try' : '--bind-try',
        src: parent,
        dest: parent,
      });
    }
  }

  for (const p of resolvedPaths.policyRead) {
    mounts.push({ type: '--ro-bind-try', src: p, dest: p });
  }

  // Collect explicit additional write permissions.
  for (const p of resolvedPaths.policyWrite) {
    mounts.push({ type: '--bind-try', src: p, dest: p });
  }

  const policyWriteKeys = new Set(resolvedPaths.policyWrite.map(toPathKey));

  for (const file of GOVERNANCE_FILES) {
    const filePath = join(workspace.original, file.path);
    const realPath = join(workspace.resolved, file.path);

    const isExplicitlyWritable =
      policyWriteKeys.has(toPathKey(filePath)) ||
      policyWriteKeys.has(toPathKey(realPath));

    // If the workspace is writable, we allow editing .gitignore and .geminiignore by default.
    // .git remains protected unless explicitly requested (e.g. for git commands).
    const isImplicitlyWritable = workspaceWrite && file.path !== '.git';

    if (!isExplicitlyWritable && !isImplicitlyWritable) {
      mounts.push({ type: '--ro-bind', src: filePath, dest: filePath });
      if (realPath !== filePath) {
        mounts.push({ type: '--ro-bind', src: realPath, dest: realPath });
      }
    }
  }

  // Grant read-only access to git worktrees/submodules.
  if (resolvedPaths.gitWorktree) {
    const { worktreeGitDir, mainGitDir } = resolvedPaths.gitWorktree;
    if (worktreeGitDir && !policyWriteKeys.has(toPathKey(worktreeGitDir))) {
      mounts.push({
        type: '--ro-bind-try',
        src: worktreeGitDir,
        dest: worktreeGitDir,
      });
    }
    if (mainGitDir && !policyWriteKeys.has(toPathKey(mainGitDir))) {
      mounts.push({
        type: '--ro-bind-try',
        src: mainGitDir,
        dest: mainGitDir,
      });
    }
  }

  for (const p of resolvedPaths.forbidden) {
    if (!fs.existsSync(p)) continue;
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        mounts.push({ type: '--tmpfs-ro', dest: p });
      } else {
        mounts.push({ type: '--ro-bind', src: '/dev/null', dest: p });
      }
    } catch (e: unknown) {
      if (isErrnoException(e) && e.code === 'ENOENT') {
        mounts.push({ type: '--symlink', src: '/dev/null', dest: p });
      } else {
        debugLogger.warn(
          `Failed to secure forbidden path ${p}: ${e instanceof Error ? e.message : String(e)}`,
        );
        mounts.push({ type: '--ro-bind', src: '/dev/null', dest: p });
      }
    }
  }

  // Mask secret files (.env, .env.*)
  const searchDirs = new Set([
    resolvedPaths.workspace.original,
    resolvedPaths.workspace.resolved,
    ...resolvedPaths.policyAllowed,
    ...resolvedPaths.globalIncludes,
  ]);
  const findPatterns = getSecretFileFindArgs();

  for (const dir of searchDirs) {
    try {
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
          mounts.push({ type: '--bind', src: maskFilePath, dest: file.trim() });
        }
      }
    } catch (e) {
      debugLogger.log(
        `LinuxSandboxManager: Failed to find or mask secret files in ${dir}`,
        e,
      );
    }
  }

  // Sort mounts by destination path length to ensure parents are bound before children.
  // This prevents hierarchical masking where a parent mount would hide a child mount.
  mounts.sort((a, b) => a.dest.length - b.dest.length);

  // Emit final bwrap arguments
  for (const m of mounts) {
    if (m.type === '--tmpfs-ro') {
      bwrapArgs.push('--tmpfs', m.dest, '--remount-ro', m.dest);
    } else {
      bwrapArgs.push(m.type, m.src, m.dest);
    }
  }

  return bwrapArgs;
}
