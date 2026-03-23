/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type SandboxManager,
  type GlobalSandboxOptions,
  type SandboxRequest,
  type SandboxedCommand,
  type ExecutionPolicy,
  sanitizePaths,
} from '../../services/sandboxManager.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
} from '../../services/environmentSanitization.js';
import {
  BASE_SEATBELT_PROFILE,
  NETWORK_SEATBELT_PROFILE,
} from './baseProfile.js';

/**
 * A SandboxManager implementation for macOS that uses Seatbelt.
 */
export class MacOsSandboxManager implements SandboxManager {
  constructor(private readonly options: GlobalSandboxOptions) {}

  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    const sanitizationConfig = getSecureSanitizationConfig(
      req.policy?.sanitizationConfig,
    );

    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    const sandboxArgs = this.buildSeatbeltArgs(this.options, req.policy);

    return {
      program: '/usr/bin/sandbox-exec',
      args: [...sandboxArgs, '--', req.command, ...req.args],
      env: sanitizedEnv,
      cwd: req.cwd,
    };
  }

  /**
   * Builds the arguments array for sandbox-exec using a strict allowlist profile.
   * It relies on parameters passed to sandbox-exec via the -D flag to avoid
   * string interpolation vulnerabilities, and normalizes paths against symlink escapes.
   *
   * Returns arguments up to the end of sandbox-exec configuration (e.g. ['-p', '<profile>', '-D', ...])
   * Does not include the final '--' separator or the command to run.
   */
  private buildSeatbeltArgs(
    options: GlobalSandboxOptions,
    policy?: ExecutionPolicy,
  ): string[] {
    const profileLines = [BASE_SEATBELT_PROFILE];
    const args: string[] = [];

    const workspacePath = this.tryRealpath(options.workspace);
    args.push('-D', `WORKSPACE=${workspacePath}`);

    const tmpPath = this.tryRealpath(os.tmpdir());
    args.push('-D', `TMPDIR=${tmpPath}`);

    const allowedPaths = sanitizePaths(policy?.allowedPaths) || [];
    for (let i = 0; i < allowedPaths.length; i++) {
      const allowedPath = this.tryRealpath(allowedPaths[i]);
      args.push('-D', `ALLOWED_PATH_${i}=${allowedPath}`);
      profileLines.push(
        `(allow file-read* file-write* (subpath (param "ALLOWED_PATH_${i}")))`,
      );
    }

    // TODO: handle forbidden paths

    if (policy?.networkAccess) {
      profileLines.push(NETWORK_SEATBELT_PROFILE);
    }

    args.unshift('-p', profileLines.join('\n'));

    return args;
  }

  /**
   * Resolves symlinks for a given path to prevent sandbox escapes.
   * If a file does not exist (ENOENT), it recursively resolves the parent directory.
   * Other errors (e.g. EACCES) are re-thrown.
   */
  private tryRealpath(p: string): string {
    try {
      return fs.realpathSync(p);
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
        const parentDir = path.dirname(p);
        if (parentDir === p) {
          return p;
        }
        return path.join(this.tryRealpath(parentDir), path.basename(p));
      }
      throw e;
    }
  }
}
