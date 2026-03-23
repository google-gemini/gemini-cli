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
  GOVERNANCE_FILES,
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

    // Add explicit deny rules for governance files in the workspace.
    // These are added after the workspace allow rule (which is in BASE_SEATBELT_PROFILE)
    // to ensure they take precedence (Seatbelt evaluates rules in order, later rules win for same path).
    for (let i = 0; i < GOVERNANCE_FILES.length; i++) {
      const governanceFile = path.join(workspacePath, GOVERNANCE_FILES[i].path);

      // Ensure the file/directory exists so Seatbelt rules are reliably applied.
      this.touch(governanceFile, GOVERNANCE_FILES[i].isDirectory);

      const realGovernanceFile = this.tryRealpath(governanceFile);

      // Determine if it should be treated as a directory (subpath) or a file (literal).
      // .git is generally a directory, while ignore files are literals.
      let isActuallyDirectory = GOVERNANCE_FILES[i].isDirectory;
      try {
        if (fs.existsSync(realGovernanceFile)) {
          isActuallyDirectory = fs.lstatSync(realGovernanceFile).isDirectory();
        }
      } catch {
        // Ignore errors, use default guess
      }

      const ruleType = isActuallyDirectory ? 'subpath' : 'literal';

      args.push('-D', `GOVERNANCE_FILE_${i}=${governanceFile}`);
      profileLines.push(
        `(deny file-write* (${ruleType} (param "GOVERNANCE_FILE_${i}")))`,
      );

      if (realGovernanceFile !== governanceFile) {
        args.push('-D', `REAL_GOVERNANCE_FILE_${i}=${realGovernanceFile}`);
        profileLines.push(
          `(deny file-write* (${ruleType} (param "REAL_GOVERNANCE_FILE_${i}")))`,
        );
      }
    }

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
   * Ensures a file or directory exists.
   */
  private touch(filePath: string, isDirectory: boolean) {
    try {
      // If it exists (even as a broken symlink), do nothing
      if (fs.lstatSync(filePath)) return;
    } catch {
      // Ignore ENOENT
    }

    if (isDirectory) {
      fs.mkdirSync(filePath, { recursive: true });
    } else {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.closeSync(fs.openSync(filePath, 'a'));
    }
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
