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
  GOVERNANCE_FILES,
  SECRET_FILES,
  type ResolvedSandboxPaths,
} from '../../services/sandboxManager.js';
import { isSubpath, resolveToRealPath } from '../../utils/paths.js';

/**
 * Options for building macOS Seatbelt profile.
 */
export interface SeatbeltArgsOptions {
  /** Fully resolved paths for the sandbox execution. */
  resolvedPaths: ResolvedSandboxPaths;
  /** Whether to allow network access. */
  networkAccess?: boolean;
  /** Whether to allow write access to the workspace. */
  workspaceWrite?: boolean;
}

/**
 * Escapes a string for use within a Scheme string literal "..."
 */
export function escapeSchemeString(str: string): string {
  return str.replace(/[\\"]/g, '\\$&');
}

/**
 * Checks if a path is explicitly allowed by additional write permissions.
 */
function isPathExplicitlyAllowed(
  filePath: string,
  realFilePath: string,
  policyWrite: string[],
): boolean {
  return policyWrite.some(
    (p) =>
      p === filePath ||
      p === realFilePath ||
      isSubpath(p, filePath) ||
      isSubpath(p, realFilePath),
  );
}

function denyUnlessExplicitlyAllowed(
  targetPath: string,
  ruleType: 'literal' | 'subpath',
  policyWrite: string[],
  implicitlyAllowed: boolean = false,
): string {
  if (implicitlyAllowed) {
    return '';
  }

  const realPath = resolveToRealPath(targetPath);

  if (isPathExplicitlyAllowed(targetPath, realPath, policyWrite)) {
    return ''; // Skip if explicitly allowed
  }

  let rules = `(deny file-write* (${ruleType} "${escapeSchemeString(targetPath)}"))\n`;
  if (realPath !== targetPath) {
    rules += `(deny file-write* (${ruleType} "${escapeSchemeString(realPath)}"))\n`;
  }

  return rules;
}

/**
 * Builds a complete macOS Seatbelt profile string using a strict allowlist.
 * It embeds paths directly into the profile, properly escaped for Scheme.
 */
export function buildSeatbeltProfile(options: SeatbeltArgsOptions): string {
  let profile = BASE_SEATBELT_PROFILE + '\n';
  const { resolvedPaths, networkAccess, workspaceWrite } = options;

  profile += `(allow file-read* (subpath "${escapeSchemeString(resolvedPaths.workspace.original)}"))\n`;
  profile += `(allow file-read* (subpath "${escapeSchemeString(resolvedPaths.workspace.resolved)}"))\n`;
  if (workspaceWrite) {
    profile += `(allow file-write* (subpath "${escapeSchemeString(resolvedPaths.workspace.original)}"))\n`;
    profile += `(allow file-write* (subpath "${escapeSchemeString(resolvedPaths.workspace.resolved)}"))\n`;
  }

  const tmpPath = resolveToRealPath(os.tmpdir());
  profile += `(allow file-read* file-write* (subpath "${escapeSchemeString(tmpPath)}"))\n`;

  // Support git worktrees/submodules; read-only to prevent malicious hook/config modification (RCE).
  if (resolvedPaths.gitWorktree) {
    const { worktreeGitDir, mainGitDir } = resolvedPaths.gitWorktree;
    if (worktreeGitDir) {
      profile += `(allow file-read* (subpath "${escapeSchemeString(worktreeGitDir)}"))\n`;
    }
    if (mainGitDir) {
      profile += `(allow file-read* (subpath "${escapeSchemeString(mainGitDir)}"))\n`;
    }
  }

  const nodeRootPath = resolveToRealPath(
    path.dirname(path.dirname(process.execPath)),
  );
  profile += `(allow file-read* (subpath "${escapeSchemeString(nodeRootPath)}"))\n`;

  // Add PATH directories as read-only to support nvm, homebrew, etc.
  if (process.env['PATH']) {
    const paths = process.env['PATH'].split(':');
    const addedPaths = new Set();

    for (const p of paths) {
      if (!p.trim()) continue;
      try {
        let resolved = resolveToRealPath(p);

        // If this is a 'bin' directory (like /usr/local/bin or homebrew/bin),
        // also grant read access to its parent directory so that symlinked
        // assets (like Cellar or libexec) can be read.
        if (resolved.endsWith('/bin')) {
          resolved = path.dirname(resolved);
        }

        if (!addedPaths.has(resolved)) {
          addedPaths.add(resolved);
          profile += `(allow file-read* (subpath "${escapeSchemeString(resolved)}"))\n`;
        }
      } catch {
        // Ignore paths that do not exist or are inaccessible
      }
    }
  }

  // Handle allowedPaths and globalIncludes
  const allowedPaths = [
    ...resolvedPaths.policyAllowed,
    ...resolvedPaths.globalIncludes,
  ];
  for (let i = 0; i < allowedPaths.length; i++) {
    const allowedPath = allowedPaths[i];
    profile += `(allow file-read* file-write* (subpath "${escapeSchemeString(allowedPath)}"))\n`;
  }

  // Add explicit deny rules for governance files in the workspace.
  // These are added after the workspace allow rule to ensure they take precedence
  // (Seatbelt evaluates rules in order, later rules win for same path).
  for (let i = 0; i < GOVERNANCE_FILES.length; i++) {
    const governanceFile = path.join(
      resolvedPaths.workspace.resolved,
      GOVERNANCE_FILES[i].path,
    );
    const realGovernanceFile = resolveToRealPath(governanceFile);

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

    profile += denyUnlessExplicitlyAllowed(
      governanceFile,
      isDirectory ? 'subpath' : 'literal',
      resolvedPaths.policyWrite,
      workspaceWrite && GOVERNANCE_FILES[i].path !== '.git',
    );
  }

  // Grant read-only access to git worktrees/submodules. We do this last in order to
  // ensure that these rules aren't overwritten by broader write policies.
  if (resolvedPaths.gitWorktree) {
    const { worktreeGitDir, mainGitDir } = resolvedPaths.gitWorktree;
    if (worktreeGitDir) {
      profile += denyUnlessExplicitlyAllowed(
        worktreeGitDir,
        'subpath',
        resolvedPaths.policyWrite,
      );
    }
    if (mainGitDir) {
      profile += denyUnlessExplicitlyAllowed(
        mainGitDir,
        'subpath',
        resolvedPaths.policyWrite,
      );
    }
  }

  // Add explicit deny rules for secret files (.env, .env.*) in the workspace and allowed paths.
  // We use regex rules to avoid expensive file discovery scans.
  // Anchoring to workspace/allowed paths to avoid over-blocking.
  const searchPaths = [
    resolvedPaths.workspace.resolved,
    resolvedPaths.workspace.original,
    ...resolvedPaths.policyAllowed,
    ...resolvedPaths.globalIncludes,
  ];

  for (const basePath of searchPaths) {
    for (const secret of SECRET_FILES) {
      // Map pattern to Seatbelt regex
      let regexPattern: string;
      const escapedBase = escapeRegex(basePath);
      if (secret.pattern.endsWith('*')) {
        // .env.* -> .env\..+ (match .env followed by dot and something)
        // We anchor the secret file name to either a directory separator or the start of the relative path.
        const basePattern = secret.pattern.slice(0, -1).replace(/\./g, '\\\\.');
        regexPattern = `^${escapedBase}/(.*/)?${basePattern}[^/]+$`;
      } else {
        // .env -> \.env$
        const basePattern = secret.pattern.replace(/\./g, '\\\\.');
        regexPattern = `^${escapedBase}/(.*/)?${basePattern}$`;
      }
      profile += `(deny file-read* file-write* (regex #"${regexPattern}"))\n`;
    }
  }

  // Handle granular additional read permissions
  for (let i = 0; i < resolvedPaths.policyRead.length; i++) {
    const resolved = resolvedPaths.policyRead[i];
    let isFile = false;
    try {
      isFile = fs.statSync(resolved).isFile();
    } catch {
      // Ignore error
    }
    if (isFile) {
      profile += `(allow file-read* (literal "${escapeSchemeString(resolved)}"))\n`;
    } else {
      profile += `(allow file-read* (subpath "${escapeSchemeString(resolved)}"))\n`;
    }
  }

  // Handle granular additional write permissions
  for (let i = 0; i < resolvedPaths.policyWrite.length; i++) {
    const resolved = resolvedPaths.policyWrite[i];
    let isFile = false;
    try {
      isFile = fs.statSync(resolved).isFile();
    } catch {
      // Ignore error
    }
    if (isFile) {
      profile += `(allow file-read* file-write* (literal "${escapeSchemeString(resolved)}"))\n`;
    } else {
      profile += `(allow file-read* file-write* (subpath "${escapeSchemeString(resolved)}"))\n`;
    }
  }

  // Handle forbiddenPaths
  const forbiddenPaths = resolvedPaths.forbidden;
  for (let i = 0; i < forbiddenPaths.length; i++) {
    const forbiddenPath = forbiddenPaths[i];
    profile += `(deny file-read* file-write* (subpath "${escapeSchemeString(forbiddenPath)}"))\n`;
  }

  if (networkAccess) {
    profile += NETWORK_SEATBELT_PROFILE;
  }

  return profile;
}

/**
 * Escapes a string for use within a Seatbelt regex literal #"..."
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\"]/g, (c) => {
    if (c === '"') {
      // Escape double quotes for the Scheme string literal
      return '\\"';
    }
    if (c === '\\') {
      // A literal backslash needs to be \\ in the regex.
      // To get \\ in the regex engine, we need \\\\ in the Scheme string literal.
      return '\\\\\\\\';
    }
    // For other regex special characters (like .), we need \c in the regex.
    // To get \c in the regex engine, we need \\c in the Scheme string literal.
    return '\\\\' + c;
  });
}
