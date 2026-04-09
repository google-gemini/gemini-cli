/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import {
  type SandboxPermissions,
  GOVERNANCE_FILES,
  getSecretFileFindArgs,
  sanitizePaths,
} from '../../services/sandboxManager.js';
import {
  tryRealpath,
  resolveGitWorktreePaths,
  isErrnoException,
} from '../utils/fsUtils.js';
import { spawnAsync } from '../../utils/shell-utils.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Options for building bubblewrap (bwrap) arguments.
 */
export interface BwrapArgsOptions {
  workspace: string;
  workspaceWrite: boolean;
  networkAccess: boolean;
  allowedPaths: string[];
  forbiddenPaths: string[];
  additionalPermissions: SandboxPermissions;
  includeDirectories: string[];
  maskFilePath: string;
  isWriteCommand: boolean;
}

/**
 * Builds the list of bubblewrap arguments based on the provided options.
 */
export async function buildBwrapArgs(
  options: BwrapArgsOptions,
): Promise<string[]> {
  const bwrapArgs: string[] = [
    '--unshare-all',
    '--new-session', // Isolate session
    '--die-with-parent', // Prevent orphaned runaway processes
  ];

  if (options.networkAccess || options.additionalPermissions.network) {
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

  const workspacePath = tryRealpath(options.workspace);

  const bindFlag = options.workspaceWrite ? '--bind-try' : '--ro-bind-try';

  if (options.workspaceWrite) {
    bwrapArgs.push('--bind-try', options.workspace, options.workspace);
    if (workspacePath !== options.workspace) {
      bwrapArgs.push('--bind-try', workspacePath, workspacePath);
    }
  } else {
    bwrapArgs.push('--ro-bind-try', options.workspace, options.workspace);
    if (workspacePath !== options.workspace) {
      bwrapArgs.push('--ro-bind-try', workspacePath, workspacePath);
    }
  }

  const { worktreeGitDir, mainGitDir } = resolveGitWorktreePaths(workspacePath);
  if (worktreeGitDir) {
    bwrapArgs.push(bindFlag, worktreeGitDir, worktreeGitDir);
  }
  if (mainGitDir) {
    bwrapArgs.push(bindFlag, mainGitDir, mainGitDir);
  }

  const includeDirs = sanitizePaths(options.includeDirectories);
  for (const includeDir of includeDirs) {
    try {
      const resolved = tryRealpath(includeDir);
      bwrapArgs.push('--ro-bind-try', resolved, resolved);
    } catch {
      // Ignore
    }
  }

  const normalizedWorkspace = normalize(workspacePath).replace(/\/$/, '');
  for (const allowedPath of options.allowedPaths) {
    const resolved = tryRealpath(allowedPath);
    if (!fs.existsSync(resolved)) {
      // If the path doesn't exist, we still want to allow access to its parent
      // if it's explicitly allowed, to enable creating it.
      try {
        const resolvedParent = tryRealpath(dirname(resolved));
        bwrapArgs.push(
          options.isWriteCommand ? '--bind-try' : bindFlag,
          resolvedParent,
          resolvedParent,
        );
      } catch {
        // Ignore
      }
      continue;
    }
    const normalizedAllowedPath = normalize(resolved).replace(/\/$/, '');
    if (normalizedAllowedPath !== normalizedWorkspace) {
      bwrapArgs.push('--bind-try', resolved, resolved);
    }
  }

  const additionalReads = sanitizePaths(
    options.additionalPermissions.fileSystem?.read,
  );
  for (const p of additionalReads) {
    try {
      const safeResolvedPath = tryRealpath(p);
      bwrapArgs.push('--ro-bind-try', safeResolvedPath, safeResolvedPath);
    } catch (e: unknown) {
      debugLogger.warn(e instanceof Error ? e.message : String(e));
    }
  }

  const additionalWrites = sanitizePaths(
    options.additionalPermissions.fileSystem?.write,
  );
  for (const p of additionalWrites) {
    try {
      const safeResolvedPath = tryRealpath(p);
      bwrapArgs.push('--bind-try', safeResolvedPath, safeResolvedPath);
    } catch (e: unknown) {
      debugLogger.warn(e instanceof Error ? e.message : String(e));
    }
  }

  for (const file of GOVERNANCE_FILES) {
    const filePath = join(options.workspace, file.path);
    const realPath = tryRealpath(filePath);
    bwrapArgs.push('--ro-bind', filePath, filePath);
    if (realPath !== filePath) {
      bwrapArgs.push('--ro-bind', realPath, realPath);
    }
  }

  for (const p of options.forbiddenPaths) {
    let resolved: string;
    try {
      resolved = tryRealpath(p); // Forbidden paths should still resolve to block the real path
      if (!fs.existsSync(resolved)) continue;
    } catch (e: unknown) {
      debugLogger.warn(
        `Failed to resolve forbidden path ${p}: ${e instanceof Error ? e.message : String(e)}`,
      );
      bwrapArgs.push('--ro-bind', '/dev/null', p);
      continue;
    }
    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        bwrapArgs.push('--tmpfs', resolved, '--remount-ro', resolved);
      } else {
        bwrapArgs.push('--ro-bind', '/dev/null', resolved);
      }
    } catch (e: unknown) {
      if (isErrnoException(e) && e.code === 'ENOENT') {
        bwrapArgs.push('--symlink', '/dev/null', resolved);
      } else {
        debugLogger.warn(
          `Failed to stat forbidden path ${resolved}: ${e instanceof Error ? e.message : String(e)}`,
        );
        bwrapArgs.push('--ro-bind', '/dev/null', resolved);
      }
    }
  }

  // Mask secret files (.env, .env.*)
  const secretArgs = await getSecretFilesArgs(
    options.workspace,
    options.allowedPaths,
    options.maskFilePath,
  );
  bwrapArgs.push(...secretArgs);

  return bwrapArgs;
}

/**
 * Generates bubblewrap arguments to mask secret files.
 */
async function getSecretFilesArgs(
  workspace: string,
  allowedPaths: string[],
  maskPath: string,
): Promise<string[]> {
  const args: string[] = [];
  const searchDirs = new Set([workspace, ...allowedPaths]);
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
