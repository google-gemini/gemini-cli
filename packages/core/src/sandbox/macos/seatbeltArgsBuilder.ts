/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import {
  BASE_SEATBELT_PROFILE,
  NETWORK_SEATBELT_PROFILE,
} from './baseProfile.js';

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
 * Attempts to resolve the real path of a given path (resolving symlinks).
 * Falls back to the original path ONLY if the file does not exist (ENOENT).
 * All other errors (e.g. EACCES) are re-thrown to prevent symlink-based sandbox escapes.
 */
function tryRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
      return p;
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
