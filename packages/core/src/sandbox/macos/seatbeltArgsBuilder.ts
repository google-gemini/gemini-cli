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
import { GOVERNANCE_FILES } from '../../services/sandboxManager.js';

/**
 * Options for building macOS Seatbelt arguments.
 */
export interface SeatbeltArgsOptions {
  /** The primary workspace path to allow access to. */
  workspace: string;
  /** Additional paths to allow access to. */
  allowedPaths?: string[];
  /** Whether to allow network access. */
  networkAccess?: boolean;
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

  // Add explicit deny rules for governance files in the workspace.
  // These are added after the workspace allow rule (which is in BASE_SEATBELT_PROFILE)
  // to ensure they take precedence (Seatbelt evaluates rules in order, later rules win for same path).
  for (let i = 0; i < GOVERNANCE_FILES.length; i++) {
    const governanceFile = path.join(workspacePath, GOVERNANCE_FILES[i]);
    const realGovernanceFile = tryRealpath(governanceFile);

    // Determine if it should be treated as a directory (subpath) or a file (literal).
    // .git is generally a directory, while ignore files are literals.
    let isDirectory = GOVERNANCE_FILES[i] === '.git';
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

  const tmpPath = tryRealpath(os.tmpdir());
  args.push('-D', `TMPDIR=${tmpPath}`);

  if (options.allowedPaths) {
    for (let i = 0; i < options.allowedPaths.length; i++) {
      const allowedPath = tryRealpath(options.allowedPaths[i]);
      args.push('-D', `ALLOWED_PATH_${i}=${allowedPath}`);
      profile += `(allow file-read* file-write* (subpath (param "ALLOWED_PATH_${i}")))\n`;
    }
  }

  if (options.networkAccess) {
    profile += NETWORK_SEATBELT_PROFILE;
  }

  args.unshift('-p', profile);

  return args;
}
