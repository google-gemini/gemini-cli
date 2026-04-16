/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GlobalSandboxOptions,
  SandboxRequest,
  SandboxPermissions,
} from '../../services/sandboxManager.js';
import { resolveGitWorktreePaths } from './fsUtils.js';
import {
  toPathKey,
  deduplicateAbsolutePaths,
  resolveToRealPath,
} from '../../utils/paths.js';

/**
 * A structured result of fully resolved sandbox paths.
 * All paths in this object are absolute, deduplicated, and expanded to include
 * both the original path and its real target (if it is a symlink).
 */
export interface ResolvedSandboxPaths {
  /** The primary workspace directory. */
  workspace: {
    /** The original path provided in the sandbox options. */
    original: string;
    /** The real path. */
    resolved: string;
  };
  /** Explicitly denied paths. */
  forbidden: string[];
  /** Directories included globally across all commands in this sandbox session. */
  globalIncludes: string[];
  /** Paths explicitly allowed by the policy of the currently executing command. */
  policyAllowed: string[];
  /** Paths granted temporary read access by the current command's dynamic permissions. */
  policyRead: string[];
  /** Paths granted temporary write access by the current command's dynamic permissions. */
  policyWrite: string[];
  /** Auto-detected paths for git worktrees/submodules. */
  gitWorktree?: {
    /** The actual .git directory for this worktree. */
    worktreeGitDir: string;
    /** The main repository's .git directory (if applicable). */
    mainGitDir?: string;
  };
}

/**
 * Resolves and sanitizes all path categories for a sandbox request.
 */
export async function resolveSandboxPaths(
  options: GlobalSandboxOptions,
  req: SandboxRequest,
  overridePermissions?: SandboxPermissions,
): Promise<ResolvedSandboxPaths> {
  /**
   * Helper that expands each path to include its realpath (if it's a symlink)
   * and pipes the result through deduplicateAbsolutePaths for deduplication and absolute path enforcement.
   */
  const expand = (paths?: string[] | null): string[] => {
    if (!paths || paths.length === 0) return [];
    const expanded = paths.flatMap((p) => {
      try {
        const resolved = resolveToRealPath(p);
        return resolved === p ? [p] : [p, resolved];
      } catch {
        return [p];
      }
    });
    return deduplicateAbsolutePaths(expanded);
  };

  const forbidden = expand(await options.forbiddenPaths?.());

  const globalIncludes = expand(options.includeDirectories);
  const policyAllowed = expand(req.policy?.allowedPaths);

  const policyRead = expand(overridePermissions?.fileSystem?.read);
  const policyWrite = expand(overridePermissions?.fileSystem?.write);

  const resolvedWorkspace = resolveToRealPath(options.workspace);

  const workspaceIdentities = new Set(
    [options.workspace, resolvedWorkspace].map(toPathKey),
  );
  const forbiddenIdentities = new Set(forbidden.map(toPathKey));

  const { worktreeGitDir, mainGitDir } =
    await resolveGitWorktreePaths(resolvedWorkspace);
  const gitWorktree = worktreeGitDir
    ? { gitWorktree: { worktreeGitDir, mainGitDir } }
    : undefined;

  /**
   * Filters out any paths that are explicitly forbidden or match the workspace root (original or resolved).
   */
  const filter = (paths: string[]) =>
    paths.filter((p) => {
      const identity = toPathKey(p);
      return (
        !workspaceIdentities.has(identity) && !forbiddenIdentities.has(identity)
      );
    });

  return {
    workspace: {
      original: options.workspace,
      resolved: resolvedWorkspace,
    },
    forbidden,
    globalIncludes: filter(globalIncludes),
    policyAllowed: filter(policyAllowed),
    policyRead: filter(policyRead),
    policyWrite: filter(policyWrite),
    ...gitWorktree,
  };
}
